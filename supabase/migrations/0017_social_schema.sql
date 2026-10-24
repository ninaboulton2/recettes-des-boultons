-- ============================================================================
--  0017 — Schéma social v2 (« expand » seulement) : groupes, amis, partage, carnets
-- ============================================================================
--  QUAND : phase 2 du plan v2 (voir le dossier « WebApp - Recettes v2 », §2 et
--  §9). Peut être appliquée en production À TOUT MOMENT, bien avant la bascule
--  v2 : elle ne change rien pour le site actuel (code à 95a010c).
--  Prérequis : 0016 (recipe_translations) ; 0009 (private.is_admin).
--
--  EXPAND-ONLY — ce que garantit cette migration
--   - aucune colonne supprimée ni renommée, aucun type modifié ;
--   - aucune fonction existante modifiée (aucune signature, aucun corps) ;
--   - aucune politique RLS existante modifiée ;
--   - colonnes ajoutées aux tables existantes : nullables, ou avec un défaut
--     sans effet tant que les politiques de la phase 3 ne les lisent pas ;
--   - tables nouvelles : RLS activée, AUCUNE politique, AUCUNE autorisation
--     pour anon / authenticated (revoke explicite) : fermées à l'API tant que
--     la phase 3 n'a pas écrit ses politiques ET ses `grant` ciblés.
--     (service_role, qui contourne le RLS, garde les droits par défaut.)
--
--  QUOI
--   A. Colonnes ajoutées à `recipes` : owner_id, visibility, copied_from,
--      category_id (toutes nullables ou à défaut inoffensif). Le lien public
--      n'est PAS une colonne de `recipes` (voir CHOIX n° 3).
--   B. Colonnes ajoutées à `profiles` : display_name, cookbook_title,
--      theme_settings, active_theme_group_id, discoverable, onboarded_at.
--      Le rôle (`profiles.role`) n'est pas touché (voir « POUR LA PHASE 3 »).
--   C. Nouvelles tables (toutes avec RLS, sans politique) :
--        categories          catégories PAR personne (slug stable, noms fr / en)
--        groups              un groupe (nom, créateur, thème jsonb)
--        group_members       qui est dans quel groupe (rôle creator | member)
--        friendships         demande d'amitié puis acceptation (une par paire)
--        invitations         invitations à un groupe (ou amitié) à accepter
--        recipe_grants       droits recette par recette (personne OU groupe)
--        recipe_share_links  jeton du lien public d'une recette
--        cookbook_entries    recettes « ajoutées telles quelles » au carnet
--        notifications       demandes, invitations, partages
--        reports             signalements de contenu
--        system_alerts       état du crédit IA et alertes
--
--  CHOIX DE CONCEPTION (à valider par Nina — le dossier est ambigu ou muet)
--   1. Thèmes = colonnes jsonb, pas de table `themes`. `groups.theme` et
--      `profiles.theme_settings` (JSON validé par Zod côté app, dossier §5.2) ;
--      les préréglages restent dans le code. Un objet JSON est exigé (check).
--      `profiles.theme` existe déjà ('light' | 'dark', mode d'affichage) : le
--      thème de couleurs a donc un autre nom (`theme_settings`).
--   2. « Thème actif » = `profiles.active_theme_group_id` (FK vers groups,
--      `on delete set null`) au lieu d'un texte 'personal' | <id de groupe> :
--      NULL = thème personnel, sinon le groupe. Plus sûr (clé étrangère).
--   3. Lien public = table `recipe_share_links` (une ligne = lien actif) et non
--      `recipes.share_token`. Raison : `recipes` se lit en `select *` (aujourd'hui
--      par tout le monde, demain par tout destinataire en lecture seule) ; un
--      jeton dans cette table fuirait vers des gens qui ne doivent pas pouvoir
--      le repartager (« lien public : auteur seulement », §2.5).
--   4. Droits = `recipe_grants`, un SEUL droit par (recette, personne) et par
--      (recette, groupe) (index uniques partiels) : le plus récent remplace.
--      Conséquence : un repartage reçu puis un droit direct reçu = une seule
--      ligne ; retirer le droit direct retire alors tout (cas limite accepté).
--      Garde-fous en base : un repartage (origin 'reshare') exige
--      `source_grant_id` et ne peut dépasser `copy` ; un lien (origin 'link')
--      aussi. On ne se donne pas un droit à soi-même.
--   5. « Partager en rejoignant un groupe, par défaut aucune recette »
--      (réponse n° 1) : l'esquisse §3.2 donne `copy` à tous les groupes en
--      commun dès que `recipes.visibility = 'groups'`, ce qui exposerait toutes
--      les recettes existantes au moment de rejoindre un groupe. Le schéma
--      permet l'autre solution : une ligne `recipe_grants` (groupe, `copy`) PAR
--      recette partagée, créée à la création de la recette (pour chaque groupe
--      de l'auteur) et, à l'arrivée dans un groupe, pour les seules recettes
--      choisies. `visibility` ('private' | 'groups', défaut 'groups') reste
--      comme réglage « partager par défaut », à trancher en phase 3.
--   6. `created_by` d'un groupe = créateur ACTUEL, `on delete restrict` : un
--      créateur ne peut pas supprimer son compte avant d'avoir passé le rôle ou
--      supprimé le groupe (§2.5, §7.4). Un seul `creator` par groupe (index
--      unique partiel). Le transfert (phase 5) doit changer `created_by` ET les
--      deux `role` dans la même transaction.
--   7. `created_at` partout (y compris `group_members`, à la place de
--      `joined_at`, et `cookbook_entries`, à la place de `added_at`).
--   8. `reports.recipe_id` et `reports.reporter_id` : `on delete set null` (un
--      signalement traité reste dans le journal après suppression de la recette
--      ou du compte). `recipe_share_links`, `cookbook_entries`, `recipe_grants`,
--      `categories`, `notifications` : cascade.
--   9. Invitations : `kind` 'group' ou 'friend' ; cible = compte (`target_user_id`),
--      adresse (`target_email`, jamais exposée) ou lien (`token_hash`, jamais le
--      jeton en clair) ; expire par défaut au bout de 30 jours. Les demandes d'amis
--      entre comptes passent par `friendships` ; `invitations 'friend'` ne sert
--      qu'aux invitations par e-mail / lien, plus tard.
--  10. Amitiés : une seule ligne par paire, quel que soit l'ordre (index unique
--      sur least / greatest). Un refus puis une nouvelle demande réutilise la
--      ligne (phase 5), elle n'en crée pas une seconde.
--  11. Pas d'index de recherche par nom (`search_users`) : à quelques centaines
--      de comptes, un balayage suffit. À ajouter si besoin.
--
--  POUR LA PHASE 3 (rien de tout cela n'est fait ici)
--   - Rôle « support » : `profiles.role` a un check ('admin','user') et le
--     trigger prevent_role_change / le hook JWT lisent ce rôle ; le passage à
--     « support » (réservé à Nina, 2ᵉ admin remis à `user`) se fait avec les
--     nouvelles politiques, pas ici.
--   - Politiques + `grant select/insert/update/delete` ciblés pour chaque table
--     ci-dessous ; fonctions private.* (recipe_level, can_read_recipe, …).
--   - `recipes.category_id` doit référencer une catégorie DU PROPRIÉTAIRE : à
--     garantir par la fonction d'écriture ou un trigger (pas faisable en check).
--   - `save_recipe` n'écrit pas encore `owner_id` : jusqu'à la phase 4
--     (remplissage 0018), les nouvelles recettes ont owner_id NULL. Sans effet.
--
--  RÉVERSIBILITÉ : supabase/rollback/0017_social_schema_down.sql (supprime les
--  tables et colonnes ci-dessus, et seulement elles).
--
--  IDEMPOTENTE : rejouable (if not exists, drop trigger if exists).
--
--  COMPTES ATTENDUS : recettes, sections, ingrédients, étapes, favoris, planning,
--  listes et politiques inchangés ; toutes les nouvelles tables vides.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0. Pré-requis et instantané « avant »
-- ----------------------------------------------------------------------------
do $$
begin
  assert to_regclass('public.recipes') is not null,             '[0017] recipes absente';
  assert to_regclass('public.profiles') is not null,            '[0017] profiles absente';
  assert to_regclass('public.recipe_translations') is not null, '[0017] recipe_translations absente : appliquer 0016';
  assert to_regprocedure('private.is_admin()') is not null,     '[0017] private.is_admin() absente : appliquer 0009';
  assert to_regprocedure('public.update_updated_at_column()') is not null, '[0017] update_updated_at_column() absente';
end $$;

create temporary table tmp_0017_before on commit drop as
  select (select count(*) from public.recipes)            as n_recipes,
         (select count(*) from public.recipe_sections)    as n_sections,
         (select count(*) from public.recipe_ingredients) as n_ingredients,
         (select count(*) from public.instructions)       as n_instructions,
         (select count(*) from public.profiles)           as n_profiles,
         -- empreinte des politiques existantes (public + storage) hors tables 0017
         (select md5(coalesce(string_agg(
                   concat_ws('|', schemaname, tablename, policyname, cmd, roles::text, qual, with_check),
                   E'\n' order by schemaname, tablename, policyname), ''))
            from pg_policies
           where schemaname in ('public', 'storage')
             and tablename not in ('categories', 'groups', 'group_members', 'friendships', 'invitations',
                                   'recipe_grants', 'recipe_share_links', 'cookbook_entries',
                                   'notifications', 'reports', 'system_alerts')) as policies_md5,
         -- empreinte des fonctions du schéma public (nom + arguments)
         (select md5(coalesce(string_agg(p.oid::regprocedure::text, E'\n' order by p.oid::regprocedure::text), ''))
            from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
           where ns.nspname = 'public') as functions_md5;

-- ----------------------------------------------------------------------------
-- 1. categories — catégories par personne
-- ----------------------------------------------------------------------------
create table if not exists public.categories (
  id         uuid        primary key default gen_random_uuid(),
  owner_id   uuid        not null references auth.users (id) on delete cascade,
  slug       text        not null check (slug ~ '^[a-z0-9][a-z0-9_-]{0,59}$'),
  name_fr    text        check (name_fr is null or btrim(name_fr) <> ''),
  name_en    text        check (name_en is null or btrim(name_en) <> ''),
  icon       text,
  color      text,
  sort_order integer     not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_owner_slug_uq unique (owner_id, slug),
  constraint categories_has_name check (name_fr is not null or name_en is not null)
);
comment on table  public.categories is 'Catégories PAR personne (v2). Les 9 catégories actuelles deviennent des suggestions copiées pour chaque compte. Fermée à l''API jusqu''à la phase 3.';
comment on column public.categories.slug is 'Clé stable (minuscules, chiffres, - et _), unique par propriétaire.';

drop trigger if exists update_categories_updated_at on public.categories;
create trigger update_categories_updated_at before update on public.categories
  for each row execute function public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 2. groups, group_members
-- ----------------------------------------------------------------------------
create table if not exists public.groups (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null check (char_length(btrim(name)) between 1 and 60),
  created_by uuid        not null references auth.users (id) on delete restrict,
  theme      jsonb       not null default '{"preset":"terracotta"}'::jsonb
                         check (jsonb_typeof(theme) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table  public.groups is 'Un groupe de personnes (famille, amis) avec son thème. Tout le monde peut en créer (phase 5).';
comment on column public.groups.created_by is 'Créateur ACTUEL (gère les membres). restrict : passer le rôle ou supprimer le groupe avant de supprimer le compte.';
create index if not exists groups_created_by_idx on public.groups (created_by);

drop trigger if exists update_groups_updated_at on public.groups;
create trigger update_groups_updated_at before update on public.groups
  for each row execute function public.update_updated_at_column();

create table if not exists public.group_members (
  group_id   uuid        not null references public.groups (id) on delete cascade,
  user_id    uuid        not null references auth.users (id) on delete cascade,
  role       text        not null default 'member' check (role in ('creator', 'member')),
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
comment on table  public.group_members is 'Appartenance à un groupe. created_at = date d''arrivée. Plusieurs groupes possibles par personne.';
create index if not exists group_members_user_group_idx on public.group_members (user_id, group_id);
create unique index if not exists group_members_one_creator_uq on public.group_members (group_id) where role = 'creator';

-- ----------------------------------------------------------------------------
-- 3. friendships
-- ----------------------------------------------------------------------------
create table if not exists public.friendships (
  id           uuid        primary key default gen_random_uuid(),
  requester_id uuid        not null references auth.users (id) on delete cascade,
  addressee_id uuid        not null references auth.users (id) on delete cascade,
  status       text        not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  constraint friendships_not_self check (requester_id <> addressee_id),
  constraint friendships_responded_coherent check ((status = 'pending') = (responded_at is null))
);
comment on table public.friendships is 'Demande d''amitié (pending) puis acceptée / refusée par le destinataire. Une seule ligne par paire, quel que soit l''ordre.';
create unique index if not exists friendships_pair_uq on public.friendships
  (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists friendships_requester_idx on public.friendships (requester_id, status);
create index if not exists friendships_addressee_idx on public.friendships (addressee_id, status);

-- ----------------------------------------------------------------------------
-- 4. invitations
-- ----------------------------------------------------------------------------
create table if not exists public.invitations (
  id             uuid        primary key default gen_random_uuid(),
  kind           text        not null check (kind in ('group', 'friend')),
  inviter_id     uuid        not null references auth.users (id) on delete cascade,
  target_user_id uuid        references auth.users (id) on delete cascade,
  target_email   text        check (target_email is null or (target_email = lower(btrim(target_email)) and position('@' in target_email) > 1)),
  group_id       uuid        references public.groups (id) on delete cascade,
  token_hash     text        check (token_hash is null or char_length(token_hash) >= 32),
  status         text        not null default 'pending'
                             check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null default (now() + interval '30 days'),
  responded_at   timestamptz,
  constraint invitations_has_target check (target_user_id is not null or target_email is not null or token_hash is not null),
  constraint invitations_group_coherent check ((kind = 'group') = (group_id is not null)),
  constraint invitations_not_self check (target_user_id is null or target_user_id <> inviter_id),
  constraint invitations_expiry_after_creation check (expires_at > created_at)
);
comment on table  public.invitations is 'Invitation à un groupe (à ACCEPTER) ou à une amitié (e-mail / lien, plus tard). Fermée à l''API jusqu''à la phase 3.';
comment on column public.invitations.target_email is 'Jamais exposée aux autres utilisateurs. Minuscules.';
comment on column public.invitations.token_hash is 'Empreinte du jeton d''invitation (le jeton en clair n''est jamais stocké).';
create index if not exists invitations_inviter_idx on public.invitations (inviter_id);
create index if not exists invitations_target_user_idx on public.invitations (target_user_id, status);
create index if not exists invitations_group_idx on public.invitations (group_id);
create index if not exists invitations_target_email_idx on public.invitations (target_email) where target_email is not null;
create unique index if not exists invitations_token_hash_uq on public.invitations (token_hash) where token_hash is not null;
create unique index if not exists invitations_pending_group_user_uq on public.invitations (group_id, target_user_id)
  where status = 'pending' and target_user_id is not null;

-- ----------------------------------------------------------------------------
-- 5. recipes : colonnes propriétaire (nullables / défaut inoffensif)
-- ----------------------------------------------------------------------------
alter table public.recipes
  add column if not exists owner_id    uuid references auth.users (id) on delete cascade,
  add column if not exists visibility  text not null default 'groups' check (visibility in ('private', 'groups')),
  add column if not exists copied_from uuid references public.recipes (id) on delete set null,
  add column if not exists category_id uuid references public.categories (id) on delete set null;
comment on column public.recipes.owner_id    is 'Auteur de la recette (v2). NULL jusqu''au remplissage (0018) ; NOT NULL ensuite (0019).';
comment on column public.recipes.visibility  is 'private | groups : réglage « partager par défaut avec mes groupes » (sans effet avant la phase 3).';
comment on column public.recipes.copied_from is 'Recette d''origine d''une copie modifiable (« inspirée de… ») ; set null si l''original est supprimé.';
comment on column public.recipes.category_id is 'Catégorie personnelle de l''auteur (remplace le texte `category` à l''étape « contract »).';
create index if not exists recipes_owner_id_idx    on public.recipes (owner_id);
create index if not exists recipes_copied_from_idx on public.recipes (copied_from) where copied_from is not null;
create index if not exists recipes_category_id_idx on public.recipes (category_id) where category_id is not null;

-- ----------------------------------------------------------------------------
-- 6. profiles : colonnes de profil social et de thème (nullables / défaut inoffensif)
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists display_name          text check (display_name is null or char_length(btrim(display_name)) between 1 and 60),
  add column if not exists cookbook_title        text check (cookbook_title is null or char_length(btrim(cookbook_title)) between 1 and 80),
  add column if not exists theme_settings        jsonb check (theme_settings is null or jsonb_typeof(theme_settings) = 'object'),
  add column if not exists active_theme_group_id uuid references public.groups (id) on delete set null,
  add column if not exists discoverable          boolean not null default true,
  add column if not exists onboarded_at          timestamptz;
comment on column public.profiles.display_name          is 'Pseudonyme libre affiché aux autres (jamais l''e-mail). NULL : repli sur `name`.';
comment on column public.profiles.cookbook_title        is 'Titre du carnet (« Recettes de Mamie »).';
comment on column public.profiles.theme_settings        is 'Thème de couleurs personnel (JSON, Zod côté app). Distinct de `theme` (light | dark).';
comment on column public.profiles.active_theme_group_id is 'NULL : thème personnel ; sinon thème de ce groupe.';
comment on column public.profiles.discoverable          is 'false : n''apparaît pas dans la recherche par nom.';
create index if not exists profiles_active_theme_group_idx on public.profiles (active_theme_group_id) where active_theme_group_id is not null;

-- ----------------------------------------------------------------------------
-- 7. recipe_grants, recipe_share_links
-- ----------------------------------------------------------------------------
create table if not exists public.recipe_grants (
  id               uuid        primary key default gen_random_uuid(),
  recipe_id        uuid        not null references public.recipes (id) on delete cascade,
  grantee_user_id  uuid        references auth.users (id) on delete cascade,
  grantee_group_id uuid        references public.groups (id) on delete cascade,
  permission       text        not null check (permission in ('read', 'copy', 'edit_original')),
  granted_by       uuid        not null references auth.users (id) on delete cascade,
  source_grant_id  uuid        references public.recipe_grants (id) on delete cascade,
  origin           text        not null default 'direct' check (origin in ('direct', 'reshare', 'link')),
  created_at       timestamptz not null default now(),
  constraint recipe_grants_one_grantee check ((grantee_user_id is null) <> (grantee_group_id is null)),
  constraint recipe_grants_not_self check (grantee_user_id is null or grantee_user_id <> granted_by),
  constraint recipe_grants_not_own_source check (source_grant_id is null or source_grant_id <> id),
  -- un repartage vient d'un droit existant et n'hérite JAMAIS du droit d'édition
  constraint recipe_grants_reshare_has_source check ((origin = 'reshare') = (source_grant_id is not null)),
  constraint recipe_grants_no_inherited_edit check (origin = 'direct' or permission <> 'edit_original')
);
comment on table  public.recipe_grants is 'Droits donnés recette par recette à une personne OU à un groupe. Un seul droit par bénéficiaire et recette.';
comment on column public.recipe_grants.source_grant_id is 'Repartage : droit d''où il vient ; supprimé en cascade avec lui.';
create unique index if not exists recipe_grants_recipe_user_uq  on public.recipe_grants (recipe_id, grantee_user_id)  where grantee_user_id is not null;
create unique index if not exists recipe_grants_recipe_group_uq on public.recipe_grants (recipe_id, grantee_group_id) where grantee_group_id is not null;
create index if not exists recipe_grants_grantee_user_idx  on public.recipe_grants (grantee_user_id, recipe_id)  where grantee_user_id is not null;
create index if not exists recipe_grants_grantee_group_idx on public.recipe_grants (grantee_group_id, recipe_id) where grantee_group_id is not null;
create index if not exists recipe_grants_granted_by_idx    on public.recipe_grants (granted_by);
create index if not exists recipe_grants_source_idx        on public.recipe_grants (source_grant_id) where source_grant_id is not null;

create table if not exists public.recipe_share_links (
  recipe_id  uuid        primary key references public.recipes (id) on delete cascade,
  token      uuid        not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);
comment on table public.recipe_share_links is 'Lien public d''une recette : une ligne = lien actif (supprimer la ligne le désactive). Jeton lu seulement par get_shared_recipe(token) (phase 3).';

-- ----------------------------------------------------------------------------
-- 8. cookbook_entries
-- ----------------------------------------------------------------------------
create table if not exists public.cookbook_entries (
  user_id     uuid        not null references auth.users (id) on delete cascade,
  recipe_id   uuid        not null references public.recipes (id) on delete cascade,
  category_id uuid        references public.categories (id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (user_id, recipe_id)
);
comment on table public.cookbook_entries is 'Recettes « ajoutées telles quelles » au carnet (références). Supprimer la recette la retire des carnets (cascade).';
create index if not exists cookbook_entries_recipe_idx   on public.cookbook_entries (recipe_id);
create index if not exists cookbook_entries_category_idx on public.cookbook_entries (category_id) where category_id is not null;

-- ----------------------------------------------------------------------------
-- 9. notifications, reports, system_alerts
-- ----------------------------------------------------------------------------
create table if not exists public.notifications (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  type       text        not null check (char_length(type) between 1 and 60),
  payload    jsonb       not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.notifications is 'Demandes d''amis, invitations, recettes partagées (cloche de l''interface).';
create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_unread_idx  on public.notifications (user_id) where read_at is null;

create table if not exists public.reports (
  id          uuid        primary key default gen_random_uuid(),
  recipe_id   uuid        references public.recipes (id) on delete set null,
  reporter_id uuid        references auth.users (id) on delete set null,
  reason      text        not null check (reason in ('illegal', 'copyright', 'spam', 'other')),
  details     text        check (details is null or char_length(details) <= 2000),
  status      text        not null default 'open' check (status in ('open', 'reviewed', 'actioned', 'dismissed')),
  created_at  timestamptz not null default now(),
  handled_at  timestamptz
);
comment on table public.reports is 'Signalements de contenu (lien « Signaler »). Conservés après suppression de la recette ou du compte (set null).';
create index if not exists reports_recipe_idx   on public.reports (recipe_id) where recipe_id is not null;
create index if not exists reports_reporter_idx on public.reports (reporter_id) where reporter_id is not null;
create index if not exists reports_open_idx     on public.reports (created_at) where status = 'open';

create table if not exists public.system_alerts (
  key         text        primary key check (char_length(key) between 1 and 60),
  status      text        not null default 'ok' check (status in ('ok', 'alert')),
  first_seen  timestamptz,
  last_seen   timestamptz,
  notified_at timestamptz,
  count       integer     not null default 0 check (count >= 0),
  created_at  timestamptz not null default now()
);
comment on table public.system_alerts is 'État du crédit IA et autres alertes (clé « ai_credit »…). Au plus un e-mail par 24 h (notified_at).';

-- ----------------------------------------------------------------------------
-- 10. RLS activée, aucune politique, aucune autorisation pour l'API
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['categories', 'groups', 'group_members', 'friendships', 'invitations',
                           'recipe_grants', 'recipe_share_links', 'cookbook_entries',
                           'notifications', 'reports', 'system_alerts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 11. Vérifications finales
-- ----------------------------------------------------------------------------
do $$
declare b record; n bigint; t text;
begin
  select * into b from tmp_0017_before;
  select count(*) into n from public.recipes;            assert n = b.n_recipes,      format('[0017] recettes : %s, attendu %s', n, b.n_recipes);
  select count(*) into n from public.recipe_sections;    assert n = b.n_sections,     format('[0017] sections : %s, attendu %s', n, b.n_sections);
  select count(*) into n from public.recipe_ingredients; assert n = b.n_ingredients,  format('[0017] ingrédients : %s, attendu %s', n, b.n_ingredients);
  select count(*) into n from public.instructions;       assert n = b.n_instructions, format('[0017] étapes : %s, attendu %s', n, b.n_instructions);
  select count(*) into n from public.profiles;           assert n = b.n_profiles,     format('[0017] profils : %s, attendu %s', n, b.n_profiles);

  -- expand-only : politiques et fonctions existantes inchangées
  assert (select md5(coalesce(string_agg(
                concat_ws('|', schemaname, tablename, policyname, cmd, roles::text, qual, with_check),
                E'\n' order by schemaname, tablename, policyname), ''))
            from pg_policies
           where schemaname in ('public', 'storage')
             and tablename not in ('categories', 'groups', 'group_members', 'friendships', 'invitations',
                                   'recipe_grants', 'recipe_share_links', 'cookbook_entries',
                                   'notifications', 'reports', 'system_alerts')) = b.policies_md5,
    '[0017] une politique existante a changé';
  assert (select md5(coalesce(string_agg(p.oid::regprocedure::text, E'\n' order by p.oid::regprocedure::text), ''))
            from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
           where ns.nspname = 'public') = b.functions_md5,
    '[0017] une fonction du schéma public a changé';

  -- nouvelles tables : fermées
  foreach t in array array['categories', 'groups', 'group_members', 'friendships', 'invitations',
                           'recipe_grants', 'recipe_share_links', 'cookbook_entries',
                           'notifications', 'reports', 'system_alerts'] loop
    assert (select relrowsecurity from pg_class where oid = format('public.%I', t)::regclass),
      format('[0017] RLS non activée sur %s', t);
    assert not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t),
      format('[0017] %s ne doit avoir aucune politique', t);
    assert not has_table_privilege('anon', format('public.%I', t), 'select')
       and not has_table_privilege('authenticated', format('public.%I', t), 'select')
       and not has_table_privilege('authenticated', format('public.%I', t), 'insert'),
      format('[0017] %s ne doit pas être accessible à l''API', t);
    execute format('select count(*) from public.%I', t) into n;
    assert n = 0, format('[0017] %s devrait être vide à la création (%s lignes)', t, n);
  end loop;

  -- colonnes ajoutées : nullables ou avec défaut
  assert not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and ((table_name = 'recipes'  and column_name in ('owner_id', 'visibility', 'copied_from', 'category_id'))
         or (table_name = 'profiles' and column_name in ('display_name', 'cookbook_title', 'theme_settings',
                                                          'active_theme_group_id', 'discoverable', 'onboarded_at')))
       and is_nullable = 'NO' and column_default is null),
    '[0017] une colonne ajoutée est NOT NULL sans défaut';
  assert (select count(*) from public.recipes where owner_id is not null) = 0, '[0017] owner_id doit être NULL partout';

  raise notice '[0017] schéma social en place : 11 tables fermées (RLS sans politique), recipes +4 colonnes, profiles +6 colonnes ; politiques et fonctions existantes inchangées';
end $$;

notify pgrst, 'reload schema';

commit;
