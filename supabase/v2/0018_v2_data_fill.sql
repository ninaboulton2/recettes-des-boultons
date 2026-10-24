-- ============================================================================
--  0018 (v2/) — REMPLISSAGE : les Boultons passent au modèle multi-utilisateurs
-- ============================================================================
--  ⚠️  NE PAS APPLIQUER AVANT LE JOUR DE LA BASCULE v2 (phase 11 du plan). Comme
--  v2/0020, ce fichier est HORS de `supabase/migrations/` : il a besoin de
--  paramètres saisis par Nina (e-mails, pseudonymes) et doit passer APRÈS 0019
--  (alors que son numéro est avant) ; aucun outil qui applique « tout le
--  dossier migrations » ne doit pouvoir le lancer par erreur.
--
--  ORDRE (dossier §4.2) : 0017 → 0019 (déjà en production) → paramètres
--  (v2/0018_params.sql + insertions) → CE FICHIER → v2/0020_rls_switchover.sql
--  → déploiement du code v2. Procédure complète : supabase/BASCULE_V2.md.
--  Prérequis : 0009, 0016, 0017, 0019 appliquées. 0020 PAS encore (ou déjà : le
--  fichier est rejouable dans les deux cas, il écrit sans passer par le RLS).
--
--  QUOI (tout est idempotent : un rejeu ne crée aucun doublon)
--   1. Groupe « Les Boultons » (nom modifiable par `group_name`), créateur = le
--      compte de Nina, thème = préréglage `boultons` (voir CHOIX n° 2).
--      Tous les comptes présents au premier passage deviennent membres
--      (Nina `creator`, les autres `member`).
--   2. `recipes.owner_id` = le compte de Nina sur TOUTES les recettes sans
--      propriétaire ; `visibility = 'groups'`. (Aucune colonne d'auteur n'existe
--      dans le schéma actuel : ni `created_by` ni `user_id` sur `recipes`, vérifié
--      dans 0001 → 0017 et le schéma de base.) Un seul droit
--      `recipe_grants` PAR RECETTE, accordé au GROUPE : `edit_original`
--      (voir CHOIX n° 3).
--   3. Catégories : les 9 catégories actuelles (texte `recipes.category`) sont
--      copiées en catégories personnelles pour CHAQUE compte (+ une catégorie
--      supplémentaire par texte inconnu, s'il en existe) ; `recipes.category_id`
--      pointe sur la catégorie de l'auteur de la recette (`slug`).
--   4. Carnets : `cookbook_entries` = les favoris actuels de chaque membre qui
--      portent sur une recette qui n'est pas la sienne (CHOIX n° 4).
--   5. Profils : `display_name` (paramètre, obligatoire), `cookbook_title`
--      (paramètre, facultatif), `active_theme_group_id` = le groupe,
--      `onboarded_at` = maintenant, rôle : Nina reste `admin` (= « support »,
--      voir 0019 CHOIX n° 5), les autres admins repassent `user` (CHOIX n° 5).
--   6. Contrôles finaux (assertions) : voir la section 9. Se terminent par la
--      vérification, avec les VRAIES fonctions `private.recipe_level`, que chaque
--      membre peut modifier toutes les recettes et qu'un inconnu n'en voit aucune.
--
--  PARAMÈTRES (table `private.v2_fill_params`, créée par v2/0018_params.sql ;
--  aucun e-mail, nom ni identifiant n'est écrit dans ce fichier) :
--      owner_email                 facultatif. Absent : le compte `admin` le plus ancien ;
--                                  arrêt s'il n'y en a pas ou si deux ont la même date.
--      group_name                  facultatif (défaut : Les Boultons)
--      display_name:<e-mail>       OBLIGATOIRE pour chaque compte sans pseudonyme. Pas de repli
--                                  sur l'e-mail (`profiles.name` contient l'e-mail).
--      cookbook_title:<e-mail>     facultatif
--  Un paramètre qui vise un e-mail inconnu, une clé inconnue, un pseudonyme contenant « @ »
--  ou en double : arrêt avec un message clair (rien n'est modifié : tout est dans une transaction).
--
--  CHOIX DE CONCEPTION (à valider par Nina)
--   1. Le fichier est dans `supabase/v2/` (comme 0020) et non dans `migrations/` :
--      il exige des paramètres, doit passer après 0019, et ne doit jamais être joué
--      par un `db push`. Les comptes concernés sont ceux présents au PREMIER passage
--      (copie dans `private.backup_0018_profiles`) : un compte créé plus tard n'est
--      jamais rattaché au groupe par un rejeu.
--   2. Thème du groupe = jsonb `{"preset":"boultons","primary":"#64b9c3","neutral":"slate",
--      "name":"Recettes des Boultons","home":"boultons"}` : clés du dossier §5.2 ; le préréglage
--      `boultons` (shared/editions/boultons.ts : palette bleu-vert 50→950, neutre `slate`, héros
--      diagonal, nom lavande) fait foi, `primary` = nuance 500 de cette palette. Les polices
--      (Inter, Fraunces, Lobster) sont communes à toutes les éditions (app/assets/css/main.css) :
--      elles ne font pas partie du thème.
--   3. Droit d'édition = UN droit de GROUPE par recette (`recipe_grants.grantee_group_id`,
--      `edit_original`), comme le dossier §4.3 (« 1 droit » pour le groupe), et non un droit
--      direct par membre : 181 lignes au lieu de 543, et un futur membre du groupe Boultons
--      édite les recettes Boultons sans autre geste. Conséquence voulue ou non, à valider :
--      QUICONQUE rejoint ce groupe peut modifier ces recettes. La lecture du droit par
--      `recipe_level` (groupe dont on est membre) est vérifiée dans le fichier ET dans les tests.
--   4. Carnets : la clarification de Nina (2026-10-24) fait de l'ajout au carnet un geste
--      explicite et le dossier §4.2 ne remplit pas `cookbook_entries`. On n'y met donc RIEN
--      automatiquement, sauf les FAVORIS actuels (geste explicite déjà posé par la personne) portant sur
--      une recette qui n'est pas la sienne : sans cela, ses favoris sortiraient de son carnet.
--      Les recettes Boultons restent LISIBLES par tous (visibility = 'groups' + droit de groupe),
--      les bannières « Explorer les recettes de Nina » ne sont pas fermées (`dismissed_prompts`
--      reste vide) : chaque membre les verra, puis pourra tout ajouter d'un geste.
--   5. Rôles : Nina garde `admin` (alias de « support » tant que le rôle n'est pas renommé,
--      0019 CHOIX n° 5). Tout autre compte `admin` passe `user`. Le déclencheur anti-escalade
--      `prevent_role_change` est contourné proprement, SANS le désactiver : pendant la mise à
--      jour des rôles seulement, la transaction porte un claim JWT local `user_role = admin`
--      (celui que lit `private.is_admin()`), restauré aussitôt. Les anciens rôles sont gardés
--      dans `private.backup_0018_profiles`.
--   6. `onboarded_at` est renseigné : ces comptes ont déjà un nom, un thème et leurs catégories ;
--      ils n'ont pas à repasser par l'accueil en 3 écrans de la v2.
--   7. `recipes.updated_at` n'est PAS modifié : le déclencheur `update_recipes_updated_at` est
--      suspendu le temps du remplissage (vérifié par une empreinte avant / après).
--   8. Clés de catégories (`slug`) = la clé i18n actuelle (`categoryKey()` : « desserts et gâteaux »
--      → `desserts_et_gateaux`), noms français / anglais = ceux de i18n/locales, icône = icône Lucide
--      actuelle (app/composables/useCategories.ts), ordre = celui de RECIPE_CATEGORIES.
--   9. Tables de travail réelles `private.tmp_0018_*` (pas de table temporaire : le SQL Editor ne
--      les garde pas d'une instruction à l'autre), supprimées en fin de fichier. Restent :
--      `private.backup_0018_profiles` et `private.backup_0018_created` (ce qu'il faut pour le retour
--      arrière), supprimées par le retour arrière.
--
--  RÉVERSIBILITÉ : supabase/rollback/0018_v2_data_fill_down.sql (retirer d'abord 0020).
--  COMPTES ATTENDUS (dossier §4.3, à refaire avant la bascule) : recettes, sections, ingrédients,
--  étapes, traductions, favoris, planning, courses : INCHANGÉS. Groupes 0 → 1, membres 0 → nombre
--  de comptes, droits 0 → un par recette, catégories 0 → 9 par compte.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0. Pré-requis, tables de sauvegarde, instantané « avant »
-- ----------------------------------------------------------------------------
do $$
begin
  assert to_regclass('public.groups') is not null and to_regclass('public.recipe_grants') is not null,
    '[0018] tables sociales absentes : appliquer 0017';
  assert to_regprocedure('private.recipe_level(uuid)') is not null and to_regprocedure('private.can_edit_recipe(uuid)') is not null,
    '[0018] fonctions d''aide absentes : appliquer 0019 AVANT le remplissage (ordre 0017 → 0019 → 0018 → 0020)';
  assert to_regprocedure('private.is_admin()') is not null,                '[0018] private.is_admin() absente : appliquer 0009';
  assert to_regprocedure('public.immutable_unaccent(text)') is not null,    '[0018] immutable_unaccent absente : appliquer 0008';
  assert to_regclass('public.recipe_translations') is not null,             '[0018] recipe_translations absente : appliquer 0016';
  assert to_regclass('private.v2_fill_params') is not null,
    '[0018] table des paramètres absente : exécuter d''abord supabase/v2/0018_params.sql, puis saisir les paramètres (BASCULE_V2.md, étape 3)';
end $$;

-- Sauvegarde pour le retour arrière (créée une fois, jamais écrasée par un rejeu)
create table if not exists private.backup_0018_profiles (
  id                    uuid primary key,
  role                  text,
  display_name          text,
  cookbook_title        text,
  active_theme_group_id uuid,
  onboarded_at          timestamptz,
  saved_at              timestamptz not null default now()
);
create table if not exists private.backup_0018_created (
  kind text not null check (kind in ('group', 'member', 'category', 'recipe_owner', 'recipe_category', 'grant', 'cookbook')),
  ref  text not null,
  primary key (kind, ref)
);
comment on table private.backup_0018_profiles is 'Profils tels qu''avant 0018 (rôle, pseudonyme, thème, onboarding) : sert au retour arrière ET définit les comptes concernés. Supprimée par le retour arrière.';
comment on table private.backup_0018_created  is 'Lignes créées ou remplies par 0018 (groupe, membres, catégories, recettes, droits, carnets) : le retour arrière ne défait que cela. Supprimée par le retour arrière.';
alter table private.backup_0018_profiles enable row level security;
alter table private.backup_0018_created  enable row level security;
revoke all on private.backup_0018_profiles, private.backup_0018_created from public, anon, authenticated;

-- Comptes concernés = les comptes existants au PREMIER passage
insert into private.backup_0018_profiles (id, role, display_name, cookbook_title, active_theme_group_id, onboarded_at)
select p.id, p.role, p.display_name, p.cookbook_title, p.active_theme_group_id, p.onboarded_at
  from public.profiles p
 where not exists (select 1 from private.backup_0018_profiles);

-- Instantané dans une vraie table (le SQL Editor de Supabase ne garde pas les tables temporaires
-- d'une instruction à l'autre) ; supprimée par la vérification finale.
drop table if exists private.tmp_0018_before;
create table private.tmp_0018_before as
  select (select count(*) from public.recipes)            as n_recipes,
         (select count(*) from public.recipe_sections)    as n_sections,
         (select count(*) from public.recipe_ingredients) as n_ingredients,
         (select count(*) from public.instructions)       as n_instructions,
         (select count(*) from public.recipe_translations) as n_translations,
         (select count(*) from public.favorites)          as n_favorites,
         (select count(*) from public.planning)           as n_planning,
         (select count(*) from public.planning_notes)     as n_planning_notes,
         (select count(*) from public.shopping_lists)     as n_lists,
         (select count(*) from public.shopping_items)     as n_items,
         (select count(*) from public.profiles)           as n_profiles,
         (select md5(coalesce(string_agg(concat_ws('|', id, title, category, updated_at), E'\n' order by id), ''))
            from public.recipes)                          as recipes_md5;

-- ----------------------------------------------------------------------------
-- 1. Contexte : propriétaire, nom du groupe, contrôle des paramètres
-- ----------------------------------------------------------------------------
drop table if exists private.tmp_0018_ctx;
create table private.tmp_0018_ctx (owner_id uuid not null, group_name text not null);

do $$
declare
  v_email text; v_owner uuid; v_group_name text; v_n bigint; v_txt text;
begin
  assert (select count(*) from private.backup_0018_profiles) > 0, '[0018] aucun compte à remplir (profiles vide)';

  -- Clés reconnues seulement
  select string_agg(key, ', ') into v_txt
    from private.v2_fill_params
   where key not in ('owner_email', 'group_name') and key !~ '^(display_name|cookbook_title):.+';
  if v_txt is not null then
    raise exception '[0018] paramètre(s) inconnu(s) : % (clés valides : owner_email, group_name, display_name:<e-mail>, cookbook_title:<e-mail>)', v_txt;
  end if;
  -- Un paramètre par compte : l'e-mail doit exister
  select string_agg(k.key, ', ') into v_txt
    from private.v2_fill_params k
   where k.key ~ '^(display_name|cookbook_title):.+'
     and not exists (select 1 from private.backup_0018_profiles b join public.profiles p on p.id = b.id
                      where lower(p.email) = substr(k.key, strpos(k.key, ':') + 1));
  if v_txt is not null then
    raise exception '[0018] paramètre(s) pour un e-mail qui n''est pas un compte concerné : % (faute de frappe ? e-mail en minuscules)', v_txt;
  end if;

  -- Propriétaire
  select lower(btrim(value)) into v_email from private.v2_fill_params where key = 'owner_email';
  if v_email is not null then
    select p.id into v_owner from public.profiles p join private.backup_0018_profiles b on b.id = p.id where lower(p.email) = v_email;
    if v_owner is null then
      raise exception '[0018] owner_email : aucun compte concerné avec l''e-mail « % »', v_email;
    end if;
  else
    select count(*) into v_n from public.profiles p join private.backup_0018_profiles b on b.id = p.id where p.role = 'admin';
    if v_n = 0 then
      raise exception '[0018] aucun compte admin : renseigner owner_email (compte de Nina)';
    end if;
    select count(*) into v_n
      from public.profiles p join private.backup_0018_profiles b on b.id = p.id
     where p.role = 'admin'
       and p.created_at is not distinct from (select min(p2.created_at) from public.profiles p2
                                               join private.backup_0018_profiles b2 on b2.id = p2.id where p2.role = 'admin');
    if v_n > 1 then
      raise exception '[0018] propriétaire AMBIGU : % comptes admin ont la même date de création. Renseigner owner_email (compte de Nina)', v_n;
    end if;
    select p.id into v_owner from public.profiles p join private.backup_0018_profiles b on b.id = p.id
     where p.role = 'admin' order by p.created_at, p.id limit 1;
    raise notice '[0018] owner_email absent : propriétaire = le compte admin le plus ancien (parmi % compte(s) admin). À VÉRIFIER : c''est lui qui recevra toutes les recettes.',
      (select count(*) from public.profiles p join private.backup_0018_profiles b on b.id = p.id where p.role = 'admin');
  end if;
  if (select role from public.profiles where id = v_owner) is distinct from 'admin' then
    raise exception '[0018] le propriétaire doit être le compte admin (support) de Nina, or son rôle est « % »',
      coalesce((select role from public.profiles where id = v_owner), 'aucun');
  end if;

  -- Nom du groupe
  select btrim(value) into v_group_name from private.v2_fill_params where key = 'group_name';
  v_group_name := coalesce(v_group_name, 'Les Boultons');
  if char_length(v_group_name) not between 1 and 60 then
    raise exception '[0018] group_name : 1 à 60 caractères';
  end if;

  -- Changer de propriétaire entre deux passages créerait un second groupe : refusé
  if exists (select 1 from private.backup_0018_created c join public.groups g on g.id::text = c.ref
              where c.kind = 'group' and g.created_by <> v_owner) then
    raise exception '[0018] le groupe créé au premier passage appartient à un autre compte que owner_email : faire d''abord le retour arrière (rollback/0018_v2_data_fill_down.sql)';
  end if;

  -- Pseudonymes : obligatoires pour qui n'en a pas, jamais un e-mail, uniques
  select string_agg(p.email, ', ') into v_txt
    from private.backup_0018_profiles b join public.profiles p on p.id = b.id
   where p.display_name is null
     and not exists (select 1 from private.v2_fill_params k where k.key = 'display_name:' || lower(p.email));
  if v_txt is not null then
    raise exception '[0018] pseudonyme manquant pour : %. Saisir display_name:<e-mail> dans private.v2_fill_params (BASCULE_V2.md, étape 3). Pas de repli sur l''e-mail, volontairement.', v_txt;
  end if;
  if exists (select 1 from private.v2_fill_params where key ~ '^(display_name|cookbook_title):' and value like '%@%') then
    raise exception '[0018] un pseudonyme ou un titre de carnet contient « @ » : on n''y met jamais d''e-mail';
  end if;
  if exists (select 1 from private.v2_fill_params where key like 'display_name:%' and char_length(btrim(value)) > 60)
     or exists (select 1 from private.v2_fill_params where key like 'cookbook_title:%' and char_length(btrim(value)) > 80) then
    raise exception '[0018] pseudonyme (60 caractères max) ou titre de carnet (80 max) trop long';
  end if;
  select count(*) - count(distinct lower(public.immutable_unaccent(nm))) into v_n
    from (select coalesce(p.display_name, (select btrim(k.value) from private.v2_fill_params k where k.key = 'display_name:' || lower(p.email))) as nm
            from private.backup_0018_profiles b join public.profiles p on p.id = b.id) s;
  if v_n > 0 then
    raise exception '[0018] deux comptes auraient le même pseudonyme : les pseudonymes doivent être distincts';
  end if;

  insert into private.tmp_0018_ctx (owner_id, group_name) values (v_owner, v_group_name);
end $$;

-- ----------------------------------------------------------------------------
-- 2. Groupe et membres
-- ----------------------------------------------------------------------------
with c as (select * from private.tmp_0018_ctx),
ins as (
  insert into public.groups (name, created_by, theme)
  select c.group_name, c.owner_id,
         jsonb_build_object('preset', 'boultons', 'primary', '#64b9c3', 'neutral', 'slate',
                            'name', 'Recettes des Boultons', 'home', 'boultons')
    from c
   where not exists (select 1 from public.groups g where g.created_by = c.owner_id and g.name = c.group_name)
  returning id)
insert into private.backup_0018_created (kind, ref) select 'group', id::text from ins on conflict do nothing;

with c as (select * from private.tmp_0018_ctx),
g as (select gr.id from public.groups gr join c on gr.created_by = c.owner_id and gr.name = c.group_name),
ins as (
  insert into public.group_members (group_id, user_id, role)
  select g.id, b.id, case when b.id = c.owner_id then 'creator' else 'member' end
    from private.backup_0018_profiles b cross join g cross join c
  on conflict (group_id, user_id) do nothing
  returning group_id, user_id)
insert into private.backup_0018_created (kind, ref) select 'member', group_id::text || ':' || user_id::text from ins on conflict do nothing;

-- ----------------------------------------------------------------------------
-- 3. Profils : pseudonyme, titre du carnet, thème actif, onboarding
--    (le déclencheur de garde du thème actif laisse passer les migrations : auth.uid() est NULL)
-- ----------------------------------------------------------------------------
update public.profiles p
   set display_name = (select btrim(k.value) from private.v2_fill_params k where k.key = 'display_name:' || lower(p.email))
 where p.id in (select id from private.backup_0018_profiles) and p.display_name is null;

update public.profiles p
   set cookbook_title = (select btrim(k.value) from private.v2_fill_params k where k.key = 'cookbook_title:' || lower(p.email))
 where p.id in (select id from private.backup_0018_profiles) and p.cookbook_title is null
   and exists (select 1 from private.v2_fill_params k where k.key = 'cookbook_title:' || lower(p.email));

update public.profiles p
   set active_theme_group_id = g.id
  from private.tmp_0018_ctx c
  join public.groups g on g.created_by = c.owner_id and g.name = c.group_name
 where p.id in (select id from private.backup_0018_profiles) and p.active_theme_group_id is null;

update public.profiles
   set onboarded_at = now()
 where id in (select id from private.backup_0018_profiles) and onboarded_at is null;

-- Rôles : Nina reste admin (= support), les autres admins repassent user.
-- `prevent_role_change` exige private.is_admin() ; hors API il n'y a pas de JWT. On porte, le temps de
-- l'UPDATE et dans cette transaction seulement, un claim `user_role = admin` (c'est lui que lit is_admin()),
-- puis on remet le claim d'origine. Le déclencheur reste actif.
do $$
declare v_prev text := current_setting('request.jwt.claims', true);
begin
  perform set_config('request.jwt.claims', '{"role":"service_role","user_role":"admin"}', true);
  update public.profiles p
     set role = 'user'
   where p.id in (select id from private.backup_0018_profiles)
     and p.role = 'admin'
     and p.id <> (select owner_id from private.tmp_0018_ctx);
  perform set_config('request.jwt.claims', coalesce(v_prev, ''), true);
end $$;

-- ----------------------------------------------------------------------------
-- 4. Catégories personnelles (copie des 9 catégories actuelles pour chaque compte)
-- ----------------------------------------------------------------------------
-- slug = clé i18n actuelle (voir CHOIX n° 8) : minuscules sans accents, espaces → « _ »
drop table if exists private.tmp_0018_slugs;
create table private.tmp_0018_slugs as
select t.txt,
       coalesce(nullif(regexp_replace(
         left(regexp_replace(regexp_replace(regexp_replace(lower(public.immutable_unaccent(t.txt)), '\s+', '_', 'g'), '[^a-z0-9_-]', '', 'g'), '_{2,}', '_', 'g'), 60),
         '^[_-]+', ''), ''), 'autre') as slug
  from (select distinct btrim(category) as txt from public.recipes) t;

drop table if exists private.tmp_0018_catmap;
create table private.tmp_0018_catmap as
with std (legacy, name_fr, name_en, icon, sort_order) as (values
  ('soupes',              'Soupes',                                        'Soups',                              'i-lucide-soup',       0),
  ('entrees',             'Entrées, Salades, Pains et accompagnements',    'Starters, Salads, Breads and sides', 'i-lucide-salad',      1),
  ('plats',               'Plats',                                         'Main dishes',                        'i-lucide-utensils',   2),
  ('poissons',            'Poissons',                                      'Fish',                               'i-lucide-fish',       3),
  ('viandes',             'Viandes',                                       'Meat',                               'i-lucide-beef',       4),
  ('yaourts et fromages', 'Yaourts et fromages',                           'Yogurts and cheeses',                'i-lucide-milk',       5),
  ('desserts et gâteaux', 'Desserts et gâteaux',                           'Desserts and cakes',                 'i-lucide-cake-slice', 6),
  ('boissons',            'Boissons',                                      'Beverages',                          'i-lucide-cup-soda',   7),
  ('confitures',          'Confitures',                                    'Jams',                               'i-lucide-cherry',     8)),
std_slug as (
  select regexp_replace(lower(public.immutable_unaccent(legacy)), '\s+', '_', 'g') as slug, name_fr, name_en, icon, sort_order from std)
select slug, name_fr, name_en, icon, sort_order from std_slug
union all
-- textes de catégorie inconnus (s'il y en a) : une catégorie de plus, pour ne rien perdre
select s.slug, coalesce(nullif(min(s.txt), ''), 'Autre'), null::text, null::text,
       (100 + dense_rank() over (order by s.slug))::int
  from private.tmp_0018_slugs s
 where s.slug not in (select slug from std_slug)
 group by s.slug;

with ins as (
  insert into public.categories (owner_id, slug, name_fr, name_en, icon, sort_order)
  select b.id, m.slug, m.name_fr, m.name_en, m.icon, m.sort_order
    from private.backup_0018_profiles b cross join private.tmp_0018_catmap m
  on conflict (owner_id, slug) do nothing
  returning id)
insert into private.backup_0018_created (kind, ref) select 'category', id::text from ins on conflict do nothing;

-- ----------------------------------------------------------------------------
-- 5. Recettes : propriétaire, visibilité, catégorie, droit d'édition du groupe
--    (updated_at préservé : le déclencheur est suspendu, voir CHOIX n° 7)
-- ----------------------------------------------------------------------------
do $$
declare v_trigger boolean;
begin
  select exists (select 1 from pg_trigger where tgrelid = 'public.recipes'::regclass and tgname = 'update_recipes_updated_at' and not tgisinternal)
    into v_trigger;
  if v_trigger then alter table public.recipes disable trigger update_recipes_updated_at; end if;

  with upd as (
    update public.recipes r
       set owner_id = c.owner_id, visibility = 'groups'
      from private.tmp_0018_ctx c
     where r.owner_id is null
    returning r.id)
  insert into private.backup_0018_created (kind, ref) select 'recipe_owner', id::text from upd on conflict do nothing;

  with upd as (
    update public.recipes r
       set category_id = cat.id
      from private.tmp_0018_ctx c, private.tmp_0018_slugs s, public.categories cat
     where r.category_id is null
       and r.owner_id = c.owner_id
       and s.txt = btrim(r.category)
       and cat.owner_id = r.owner_id and cat.slug = s.slug
    returning r.id)
  insert into private.backup_0018_created (kind, ref) select 'recipe_category', id::text from upd on conflict do nothing;

  if v_trigger then alter table public.recipes enable trigger update_recipes_updated_at; end if;
end $$;

-- Un droit PAR RECETTE, accordé au groupe (recettes remplies par 0018 seulement : voir CHOIX n° 3)
with ins as (
  insert into public.recipe_grants (recipe_id, grantee_group_id, permission, granted_by, origin)
  select r.id, g.id, 'edit_original', c.owner_id, 'direct'
    from private.tmp_0018_ctx c
    join public.groups g  on g.created_by = c.owner_id and g.name = c.group_name
    join public.recipes r on r.owner_id = c.owner_id
   where r.id::text in (select ref from private.backup_0018_created where kind = 'recipe_owner')
  on conflict (recipe_id, grantee_group_id) where grantee_group_id is not null do nothing
  returning id)
insert into private.backup_0018_created (kind, ref) select 'grant', id::text from ins on conflict do nothing;

-- ----------------------------------------------------------------------------
-- 6. Carnets : les favoris actuels sur les recettes des autres (voir CHOIX n° 4)
-- ----------------------------------------------------------------------------
with ins as (
  insert into public.cookbook_entries (user_id, recipe_id, category_id)
  select f.user_id, f.recipe_id, cat.id
    from public.favorites f
    join private.backup_0018_profiles b on b.id = f.user_id
    join public.recipes r on r.id = f.recipe_id and r.owner_id <> f.user_id
    left join private.tmp_0018_slugs s on s.txt = btrim(r.category)
    left join public.categories cat on cat.owner_id = f.user_id and cat.slug = s.slug
   where r.id::text in (select ref from private.backup_0018_created where kind = 'recipe_owner')
  on conflict (user_id, recipe_id) do nothing
  returning user_id, recipe_id)
insert into private.backup_0018_created (kind, ref) select 'cookbook', user_id::text || ':' || recipe_id::text from ins on conflict do nothing;

-- ----------------------------------------------------------------------------
-- 7. Vérifications finales
-- ----------------------------------------------------------------------------
do $$
declare
  b record; c record; n bigint; acct record; v_prev text := current_setting('request.jwt.claims', true);
  v_members bigint; v_accounts bigint;
begin
  select * into b from private.tmp_0018_before;
  select * into c from private.tmp_0018_ctx;

  -- rien de perdu ni de dupliqué
  select count(*) into n from public.recipes;            assert n = b.n_recipes,       format('[0018] recettes : %s, attendu %s', n, b.n_recipes);
  select count(*) into n from public.recipe_sections;    assert n = b.n_sections,      format('[0018] sections : %s, attendu %s', n, b.n_sections);
  select count(*) into n from public.recipe_ingredients; assert n = b.n_ingredients,   format('[0018] ingrédients : %s, attendu %s', n, b.n_ingredients);
  select count(*) into n from public.instructions;       assert n = b.n_instructions,  format('[0018] étapes : %s, attendu %s', n, b.n_instructions);
  select count(*) into n from public.recipe_translations; assert n = b.n_translations, format('[0018] traductions : %s, attendu %s', n, b.n_translations);
  select count(*) into n from public.favorites;          assert n = b.n_favorites,     format('[0018] favoris : %s, attendu %s', n, b.n_favorites);
  select count(*) into n from public.planning;           assert n = b.n_planning,      format('[0018] planning : %s, attendu %s', n, b.n_planning);
  select count(*) into n from public.planning_notes;     assert n = b.n_planning_notes, format('[0018] notes de planning : %s, attendu %s', n, b.n_planning_notes);
  select count(*) into n from public.shopping_lists;     assert n = b.n_lists,         format('[0018] listes : %s, attendu %s', n, b.n_lists);
  select count(*) into n from public.shopping_items;     assert n = b.n_items,         format('[0018] articles : %s, attendu %s', n, b.n_items);
  select count(*) into n from public.profiles;           assert n = b.n_profiles,      format('[0018] profils : %s, attendu %s', n, b.n_profiles);
  assert (select md5(coalesce(string_agg(concat_ws('|', id, title, category, updated_at), E'\n' order by id), '')) from public.recipes) = b.recipes_md5,
    '[0018] titre, catégorie (texte) ou updated_at d''une recette a changé';

  -- propriétaires
  select count(*) into n from public.recipes where owner_id is null;
  assert n = 0, format('[0018] %s recette(s) sans owner_id', n);
  select count(*) into n from public.recipes r where not exists (select 1 from public.profiles p where p.id = r.owner_id);
  assert n = 0, format('[0018] %s recette(s) dont le propriétaire n''a pas de profil', n);
  assert not exists (select 1 from public.recipes r where r.owner_id <> c.owner_id and r.id::text in (select ref from private.backup_0018_created where kind = 'recipe_owner')),
    '[0018] une recette remplie n''appartient pas au propriétaire';
  assert not exists (select 1 from public.recipes r where r.id::text in (select ref from private.backup_0018_created where kind = 'recipe_owner') and r.visibility <> 'groups'),
    '[0018] une recette remplie n''est pas en visibility = groups';

  -- groupe : 1 créateur (le propriétaire), tous les comptes concernés membres
  assert (select count(*) from public.groups g where g.created_by = c.owner_id and g.name = c.group_name) = 1, '[0018] il devrait y avoir exactement 1 groupe';
  select count(*) into v_members from public.group_members gm join public.groups g on g.id = gm.group_id and g.created_by = c.owner_id and g.name = c.group_name;
  select count(*) into v_accounts from private.backup_0018_profiles;
  assert v_members >= v_accounts, format('[0018] membres : %s, attendu au moins %s', v_members, v_accounts);
  assert (select count(*) from public.group_members gm join public.groups g on g.id = gm.group_id and g.created_by = c.owner_id and g.name = c.group_name
           where gm.role = 'creator' and gm.user_id = c.owner_id) = 1, '[0018] le groupe doit avoir exactement 1 créateur : le propriétaire';
  assert not exists (select 1 from private.backup_0018_profiles bp
                      where not exists (select 1 from public.group_members gm join public.groups g on g.id = gm.group_id
                                         where g.created_by = c.owner_id and g.name = c.group_name and gm.user_id = bp.id)),
    '[0018] un compte n''est pas membre du groupe';

  -- profils
  assert not exists (select 1 from public.profiles p join private.backup_0018_profiles bp on bp.id = p.id
                      where p.display_name is null or p.display_name like '%@%' or lower(p.display_name) = lower(p.email)),
    '[0018] un compte n''a pas de pseudonyme valide (introuvable dans la recherche)';
  assert not exists (select 1 from public.profiles p join private.backup_0018_profiles bp on bp.id = p.id
                      where p.active_theme_group_id is distinct from (select g.id from public.groups g where g.created_by = c.owner_id and g.name = c.group_name)),
    '[0018] thème actif : un compte ne pointe pas sur le groupe';
  assert (select role from public.profiles where id = c.owner_id) = 'admin', '[0018] le propriétaire n''est plus admin';
  assert (select count(*) from public.profiles p join private.backup_0018_profiles bp on bp.id = p.id where p.role = 'admin') = 1,
    '[0018] il doit rester exactement 1 compte admin (support) parmi les comptes concernés';

  -- catégories : chaque compte a toutes les catégories ; toute recette du propriétaire est reliée à SA catégorie
  assert not exists (select 1 from private.backup_0018_profiles bp cross join private.tmp_0018_catmap m
                      where not exists (select 1 from public.categories cat where cat.owner_id = bp.id and cat.slug = m.slug)),
    '[0018] un compte n''a pas toutes les catégories';
  select count(*) into n from public.recipes r where r.owner_id = c.owner_id and r.category_id is null;
  assert n = 0, format('[0018] %s recette(s) sans category_id', n);
  assert not exists (select 1 from public.recipes r
                      join private.tmp_0018_slugs s on s.txt = btrim(r.category)
                      join public.categories cat on cat.id = r.category_id
                     where r.owner_id = c.owner_id and (cat.owner_id <> r.owner_id or cat.slug <> s.slug)),
    '[0018] une recette pointe sur une catégorie qui n''est pas la sienne / qui ne correspond pas à son texte';

  -- droit d'édition du groupe : un par recette remplie
  select count(*) into n from public.recipes r
   where r.id::text in (select ref from private.backup_0018_created where kind = 'recipe_owner')
     and not exists (select 1 from public.recipe_grants rg join public.groups g on g.id = rg.grantee_group_id
                      where rg.recipe_id = r.id and g.created_by = c.owner_id and g.name = c.group_name
                        and rg.permission = 'edit_original' and rg.origin = 'direct' and rg.granted_by = c.owner_id);
  assert n = 0, format('[0018] %s recette(s) sans droit edit_original du groupe', n);

  -- Les VRAIES fonctions de 0019/0020, avec l'identité de chaque compte (claim JWT local, restauré après) :
  -- le propriétaire est auteur (4), chaque membre peut modifier (≥ 3), un inconnu ne voit rien (0).
  for acct in select bp.id, (bp.id = c.owner_id) as is_owner from private.backup_0018_profiles bp loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub', acct.id, 'role', 'authenticated')::text, true);
    select count(*) into n from public.recipes r
     where r.owner_id = c.owner_id and private.recipe_level(r.id) < case when acct.is_owner then 4 else 3 end;
    assert n = 0, format('[0018] un compte ne peut pas modifier %s recette(s) du groupe (droit edit_original non pris en compte)', n);
    select count(*) into n from public.recipes r where r.owner_id = c.owner_id and not private.can_edit_recipe(r.id);
    assert n = 0, '[0018] can_edit_recipe refuse une recette du groupe';
  end loop;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  select count(*) into n from public.recipes r where private.recipe_level(r.id) > 0 or private.can_read_recipe(r.id);
  assert n = 0, format('[0018] un compte inconnu verrait %s recette(s)', n);
  perform set_config('request.jwt.claims', coalesce(v_prev, ''), true);

  -- les garde-fous de 0020 passeront
  assert not exists (select 1 from public.recipes where owner_id is null), '[0018] 0020 refuserait : recette sans owner_id';
  assert not exists (select 1 from public.recipes r where not exists (select 1 from public.profiles p where p.id = r.owner_id)),
    '[0018] 0020 refuserait : propriétaire sans profil';

  raise notice '[0018] groupe « % » (créateur et propriétaire : « % ») : % membre(s), 1 créateur ; % recette(s) au propriétaire (% remplie(s) par 0018 au total), % droit(s) edit_original du groupe ; % catégorie(s) par compte ; % entrée(s) de carnet (favoris) ; admins : 1 (support) ; comptes de recettes / sections / ingrédients / étapes / traductions / favoris / planning / courses inchangés',
    c.group_name, (select display_name from public.profiles where id = c.owner_id), v_members,
    (select count(*) from public.recipes where owner_id = c.owner_id),
    (select count(*) from private.backup_0018_created where kind = 'recipe_owner'),
    (select count(*) from private.backup_0018_created where kind = 'grant'),
    (select count(*) from private.tmp_0018_catmap),
    (select count(*) from public.cookbook_entries);
end $$;

drop table if exists private.tmp_0018_catmap;
drop table if exists private.tmp_0018_slugs;
drop table if exists private.tmp_0018_ctx;
drop table if exists private.tmp_0018_before;

notify pgrst, 'reload schema';

commit;
