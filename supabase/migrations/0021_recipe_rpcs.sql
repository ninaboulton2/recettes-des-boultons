-- ============================================================================
--  0021 — Fonctions métier côté recettes : copie, carnet, droits, repartage, lien public, bannières
-- ============================================================================
--  QUAND : phase 5A du plan v2 (dossier « WebApp - Recettes v2 », §2, §3 et §9). Peut être appliquée en
--  production À TOUT MOMENT après 0019 : elle ne change RIEN pour le site actuel (v1). Prérequis : 0016
--  (recipe_translations), 0017, 0019 (fonctions d'aide `private.*`, `dismissed_prompts`).
--
--  NUMÉROTATION : 0017 expand · 0018 remplissage (supabase/v2/) · 0019 fonctions d'aide + politiques sociales ·
--  0020 bascule des politiques (supabase/v2/) · 0021 = CETTE migration · 0022 = « contract » (le numéro 0021
--  que 0019 et le dossier lui réservaient est repris ici : le « contract » devient 0022).
--
--  CE QUI EST APPLIQUÉ ICI
--   A. Deux fonctions existantes REMPLACÉES, même signature, même retour, mêmes droits :
--        save_recipe(payload jsonb) → uuid : à la création, renseigne `owner_id` (voir CHOIX n° 1) et lit
--          `category_id` / `visibility` si le payload les fournit ; ignore ces deux clés pour un éditeur qui n'est
--          pas l'auteur. Sans ces clés, le comportement est celui de 0016, octet pour octet.
--        save_recipe_translation(uuid, text, jsonb) : le garde-fou « admin » devient « admin OU peut modifier la
--          recette » (sinon un éditeur `edit_original` ne pourrait pas enregistrer la traduction jointe à sa
--          modification). Le RLS reste le dernier juge.
--   B. 17 fonctions NOUVELLES (schéma public), toutes `security definer`, `set search_path = ''`,
--      `(select auth.uid())`, exécutables par `authenticated` seulement (révoqué pour public / anon), SAUF
--      `get_shared_recipe` (aussi `anon`) :
--        copy_recipe(source)                           copie modifiable (droit `copy` requis)
--        add_to_cookbook(recipe, category) / remove_from_cookbook(recipe)
--        list_cookbook(category, query, limit, offset) mes recettes + celles de mon carnet
--        list_author_recipes(author, limit, offset)    « Explorer les recettes de X »
--        list_shared_with_me(limit, offset)            lisibles par moi, pas encore dans mon carnet
--        grant_recipe / revoke_recipe_grant / reshare_recipe / list_recipe_grants
--        create_share_link / revoke_share_link / claim_shared_recipe / get_shared_recipe (anon)
--        recipe_usage(recipe)                          combien de carnets / copies (avant suppression)
--        pending_prompts(since, limit) / dismiss_prompt(kind, target)   bannières, calculées à la volée
--      + une aide interne `private.translation_card(uuid)` (aucun droit pour l'API : appelée seulement par les
--      fonctions ci-dessus).
--
--  CE QUI N'EST PAS TOUCHÉ : aucune table, aucune colonne, aucune politique RLS, aucune donnée. Empreintes md5
--  des politiques (public + storage) et de toutes les autres fonctions du schéma public vérifiées en fin de
--  fichier (comme 0019). `delete_recipe` reste telle quelle (voir CHOIX n° 9).
--
--  CHOIX DE CONCEPTION (à valider par Nina)
--   1. `owner_id` à la création : écrit explicitement (= auth.uid()) SEULEMENT une fois la bascule v2/0020
--      appliquée (colonne NOT NULL). Avant, il reste NULL comme aujourd'hui : le remplissage 0018 attribue à
--      Nina les recettes sans propriétaire, et une recette créée entre-temps par le 2ᵉ admin lui resterait
--      sinon attribuée par erreur. Après 0020, le DEFAULT de la colonne donnait déjà le même résultat : l'écriture
--      explicite est une ceinture de sécurité. `category_id` doit appartenir à la personne qui écrit ; si
--      `category` (texte) manque mais que `category_id` est donné, le texte est dérivé du nom français de la
--      catégorie (transitoire : le texte disparaît au « contract »).
--   2. `save_recipe` reste SECURITY INVOKER (et non definer) : le RLS (v1 : admins ; v2 : auteur ou
--      `edit_original`) est ainsi la seule source de vérité, sans la recopier. C'est une exception délibérée à la
--      règle « tout est security definer » : la rendre definer obligerait à réécrire les droits d'écriture et
--      changerait le refus v1. `delete_recipe` idem. Un éditeur ne peut ni changer `visibility` ni `category_id`
--      (ignorés, pas d'erreur : l'éditeur renvoie la recette complète telle qu'il l'a reçue).
--   3. Une COPIE est créée `visibility = 'private'` (l'auteur d'une recette restreinte n'a pas choisi de la voir
--      diffusée aux groupes de quelqu'un d'autre ; la personne peut la partager ensuite). La catégorie de la copie
--      est celle de MES catégories qui porte la même clé (`slug`) que celle de l'original, sinon aucune.
--      Photo NON copiée (phase 8 : bucket privé, copie de fichier côté serveur). `copied_from` = l'original.
--      Toutes les traductions sont copiées telles quelles (même empreinte, même `stale`).
--   4. `add_to_cookbook` : idempotente (renvoie `true` seulement à la première fois) ; sur ses propres recettes
--      c'est sans effet (`false`) ; un nouvel appel avec une catégorie déplace l'entrée, sans catégorie il ne
--      l'efface pas. La catégorie doit être à MOI. `remove_from_cookbook` : idempotente, `true` si une entrée a été
--      retirée. Retirer une recette de son carnet la fait réapparaître dans `list_shared_with_me` si elle reste
--      lisible : c'est voulu (le droit n'a pas bougé).
--   5. `list_cookbook` : mes recettes (`owned`) + les entrées de mon carnet encore lisibles (`added`) ; une entrée
--      dont le droit a été retiré disparaît de la liste (la ligne reste, elle redevient visible si le droit revient).
--      Même forme que `search_recipes` (colonnes + `lang` + `translation` = traduction la plus récente si elle
--      n'est pas périmée) : le client choisit l'affichage avec la locale, comme aujourd'hui. Catégorie rendue =
--      celle de l'auteur pour mes recettes, celle de MON rangement (`cookbook_entries.category_id`) pour les ajoutées.
--      `permission` : author | edit_original | copy | read. `author_name` = `display_name` seulement.
--   6. Droits : `grant_recipe` (auteur) applique `private.can_create_grant` (ami ou groupe commun, groupe dont on
--      est membre), le plus récent remplace (0017 n° 4). `reshare_recipe` exige un droit EXPLICITE (direct ou via un
--      groupe) : un accès implicite « groupes » ne se repartage pas (0019 n° 8) ; il ne vise qu'une PERSONNE (ami ou membre d'un de ses
--      groupes), JAMAIS un groupe (relecture de sécurité n° 2 : un repartage vers un groupe diffusait à tous ses membres un droit que
--      l'auteur n'avait donné qu'à une personne ; erreur 22023, message clair) ; refuse `edit_original` avec un
--      message clair (la contrainte `recipe_grants_no_inherited_edit` le refuserait de toute façon), plafonne au niveau de
--      l'appelant, et ne REMPLACE JAMAIS un droit existant qui n'est pas le sien (renvoie NULL) : sinon un
--      repartage pourrait rétrograder le droit donné par l'auteur. `revoke_recipe_grant` suit la politique de
--      suppression de 0019 : l'auteur, l'auteur d'un repartage, ou le bénéficiaire qui renonce ; renvoie `false`
--      sans rien dire de plus si ce n'est pas permis (pas de fuite d'existence). `list_recipe_grants` : auteur seulement.
--   7. Lien public : `create_share_link` renvoie le jeton existant s'il y en a un (idempotente) ; pour le changer :
--      `revoke_share_link` puis `create_share_link`. `get_shared_recipe(token, locale)` renvoie la recette complète
--      en JSON, SANS identifiant de recette, SANS `owner_id`, SANS e-mail ni `photo_path` (il contient l'id de la
--      recette) : seulement le pseudonyme de l'auteur et `has_photo` (la photo viendra avec les liens signés,
--      phase 8). NULL si le jeton est inconnu ou révoqué. AJOUT non demandé : `claim_shared_recipe(token)` (connecté) =
--      « Ajouter à mon carnet » depuis la page publique : crée le droit `copy` (`origin = 'link'`, réservé au serveur
--      par 0019 n° 8) puis l'entrée de carnet ; ne rétrograde jamais un droit existant. Sans elle le parcours
--      « lien → connexion → ajout » du dossier (§5.1) est impossible.
--   8. Bannières (« Explorer les recettes de X », « X a publié une recette ») : CALCULÉES À LA VOLÉE par
--      `pending_prompts` à partir des groupes communs et de `dismissed_prompts` (0019), sans table `notifications`
--      ni déclencheur. Raisons : rien à écrire ni à nettoyer (départ d'un groupe, recette retirée, droit retiré),
--      cohérent avec le droit implicite « groupes » (aucune ligne `recipe_grants` n'existe à notifier). Deux genres :
--      `author_recipes` (une ligne par co-membre qui a au moins une recette lisible pas encore dans mon carnet ;
--      `target_id` = l'auteur ; disparaît après `add_author_recipes_to_cookbook` ou `dismiss_prompt`) et
--      `new_recipe` (une ligne par recette lisible créée APRÈS que moi ET l'auteur soyons tous deux dans un groupe commun ;
--      `target_id` = la recette ; disparaît quand elle est ajoutée au carnet ou fermée). Les recettes d'avant l'arrivée
--      ne produisent donc que la bannière « Explorer » (clarification de Nina du 2026-10-24). `dismiss_prompt`
--      est idempotente. Les notifications « recette supprimée » promises par la réponse n° 4 du §10 ne sont pas faites ici
--      (voir CHOIX n° 9).
--   9. Suppression : `delete_recipe` ne change pas (même retour, mêmes erreurs). Le client appelle d'abord
--      `recipe_usage(recipe)` (auteur seulement : nombre de carnets d'AUTRES personnes + nombre de copies d'autres
--      personnes) pour avertir l'auteur. Les notifications aux personnes qui l'avaient dans leur carnet relèvent de la
--      phase 5B (table `notifications`, déclencheur sur la suppression) : rien d'écrit ici, pour ne pas toucher la v1.
--  10. Listes : `list_cookbook`, `list_author_recipes` et `list_shared_with_me` appellent `private.recipe_level`
--      une fois par recette candidate (dossier §3.4 : suffisant à l'échelle visée) et ne renvoient jamais une
--      recette de niveau 0 (le cas « support peut lire une recette signalée » de `can_read_recipe` n'ouvre pas
--      ces listes). `list_shared_with_me` inclut les recettes lisibles par le droit implicite « groupes ».
--
--  11. (relecture de sécurité n° 2) `claim_shared_recipe` : si un droit existe déjà pour cette personne et cette recette (quel
--      qu'il soit), il n'est PAS modifié (`on conflict do nothing`) ; la fonction n'ajoute que l'entrée de carnet.
--      `save_recipe` avec un `id` qui existe mais que l'appelant ne peut pas lire : insertion `on conflict do nothing`, puis le
--      MÊME refus (42501, « Action réservée aux administrateurs ») que pour un `id` lisible mais non modifiable, au lieu d'une
--      violation de clé primaire qui révélait l'existence. Faisable sans toucher la v1 : en v1 tout compte lit toutes les recettes
--      (donc `v_exists` est vrai et le chemin « mise à jour » est pris, avec le refus habituel pour un non-admin).
--
--  RÉVERSIBILITÉ : supabase/rollback/0021_recipe_rpcs_down.sql (supprime les nouvelles fonctions, restaure
--  save_recipe et save_recipe_translation de 0016).
--  IDEMPOTENTE : rejouable (create or replace, grants rejoués).
--  ATTENDU APRÈS : 17 fonctions publiques nouvelles, 2 remplacées, 0 table / politique / donnée modifiée.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0. Pré-requis et empreintes « avant »
-- ----------------------------------------------------------------------------
do $$
begin
  assert to_regclass('public.recipe_grants') is not null,        '[0021] tables sociales absentes : appliquer 0017';
  assert to_regclass('public.dismissed_prompts') is not null,    '[0021] dismissed_prompts absente : appliquer 0019';
  assert to_regclass('public.recipe_translations') is not null,  '[0021] recipe_translations absente : appliquer 0016';
  assert to_regprocedure('private.can_create_grant(uuid, uuid, uuid, text, text, uuid, uuid)') is not null
     and to_regprocedure('private.recipe_level(uuid)') is not null
     and to_regprocedure('private.can_copy_recipe(uuid)') is not null,
    '[0021] fonctions d''aide absentes : appliquer 0019';
  assert to_regprocedure('public.save_recipe_translation(uuid, text, jsonb)') is not null
     and to_regprocedure('public.save_recipe(jsonb)') is not null, '[0021] save_recipe / save_recipe_translation absentes : appliquer 0016';
  assert to_regprocedure('public.immutable_unaccent(text)') is not null, '[0021] immutable_unaccent absente : appliquer 0008';
end $$;

-- Instantané dans une vraie table (le SQL Editor de Supabase ne garde pas les tables temporaires d'une
-- instruction à l'autre) ; supprimée par la vérification finale.
drop table if exists private.tmp_0021_before;
create table private.tmp_0021_before as
  select (select count(*) from public.recipes)          as n_recipes,
         (select count(*) from public.profiles)         as n_profiles,
         (select count(*) from public.recipe_grants)    as n_grants,
         (select count(*) from public.cookbook_entries) as n_entries,
         (select md5(coalesce(string_agg(
                   concat_ws('|', schemaname, tablename, policyname, cmd, roles::text, qual, with_check),
                   E'\n' order by schemaname, tablename, policyname), ''))
            from pg_policies
           where schemaname in ('public', 'storage')) as policies_md5,
         (select md5(coalesce(string_agg(pg_get_functiondef(p.oid), E'\n' order by p.oid::regprocedure::text), ''))
            from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
           where ns.nspname = 'public'
             and p.proname not in ('save_recipe', 'save_recipe_translation',
                                   'copy_recipe', 'add_to_cookbook', 'remove_from_cookbook', 'list_cookbook',
                                   'list_author_recipes', 'list_shared_with_me', 'grant_recipe', 'revoke_recipe_grant',
                                   'reshare_recipe', 'list_recipe_grants', 'create_share_link', 'revoke_share_link',
                                   'claim_shared_recipe', 'get_shared_recipe', 'recipe_usage', 'pending_prompts',
                                   'dismiss_prompt')) as functions_md5,
         -- signature, retour, sécurité et droits des deux fonctions remplacées (doivent rester identiques)
         (select string_agg(concat_ws('|', p.oid::regprocedure::text, pg_get_function_result(p.oid), p.prosecdef,
                                      p.provolatile, coalesce(p.proconfig::text, ''), coalesce(p.proacl::text, '')),
                            E'\n' order by p.oid::regprocedure::text)
            from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
           where ns.nspname = 'public' and p.proname in ('save_recipe', 'save_recipe_translation')) as replaced_sig;

-- ----------------------------------------------------------------------------
-- 1. Aide interne (aucun droit pour l'API : appelée par les fonctions ci-dessous)
-- ----------------------------------------------------------------------------
-- Traduction la plus récente d'une recette, sous la forme de `search_recipes` (NULL si absente ou périmée)
create or replace function private.translation_card(p_recipe uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when t.stale is false then
           jsonb_build_object('locale', t.locale, 'title', t.title, 'description', t.description,
                              'notes', t.notes, 'tags', to_jsonb(t.tags))
         end
    from public.recipe_translations t
   where t.recipe_id = p_recipe
   order by t.translated_at desc
   limit 1
$$;

revoke execute on function private.translation_card(uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. save_recipe_translation (= 0016, garde-fou « admin OU peut modifier la recette »)
-- ----------------------------------------------------------------------------
create or replace function public.save_recipe_translation(
  p_recipe_id    uuid,
  p_lang         text,
  p_translation  jsonb
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_locale  text;
  v_title   text;
  v_hash    text;
  v_content jsonb;
  v_tags    text[];
begin
  if not (private.is_admin() or private.can_edit_recipe(p_recipe_id)) then
    raise exception 'Action réservée aux administrateurs' using errcode = '42501';
  end if;
  if p_lang is null or p_lang not in ('fr', 'en') then
    raise exception 'Langue source invalide : % (fr ou en attendu)', coalesce(p_lang, 'NULL') using errcode = '22023';
  end if;
  if p_translation is null or jsonb_typeof(p_translation) <> 'object' then
    raise exception 'La traduction doit être un objet JSON' using errcode = '22023';
  end if;
  if not exists (select 1 from public.recipes r where r.id = p_recipe_id) then
    raise exception 'Recette introuvable' using errcode = 'P0002';
  end if;

  v_locale  := case p_lang when 'fr' then 'en' else 'fr' end;
  v_title   := nullif(btrim(p_translation->>'title'), '');
  v_hash    := nullif(btrim(p_translation->>'source_hash'), '');
  v_content := coalesce(p_translation->'content', '{"sections": []}'::jsonb);
  if v_title is null then
    raise exception 'Le titre traduit est obligatoire' using errcode = '22023';
  end if;
  if v_hash is null then
    raise exception 'source_hash est obligatoire' using errcode = '22023';
  end if;
  if jsonb_typeof(v_content) <> 'object' or jsonb_typeof(v_content->'sections') is distinct from 'array' then
    raise exception 'content doit être { "sections": [ … ] }' using errcode = '22023';
  end if;
  if jsonb_typeof(p_translation->'tags') = 'array' then
    select coalesce(array_agg(t), '{}'::text[]) into v_tags from jsonb_array_elements_text(p_translation->'tags') t;
  else
    v_tags := '{}'::text[];
  end if;

  -- La langue source peut être corrigée (détection IA) : on la pose, et on retire
  -- une éventuelle traduction vers cette même langue (devenue la langue source).
  update public.recipes set lang = p_lang where id = p_recipe_id and lang is distinct from p_lang;
  delete from public.recipe_translations where recipe_id = p_recipe_id and locale <> v_locale;

  insert into public.recipe_translations
    (recipe_id, locale, title, description, notes, tags, content, source_hash, model, stale, translated_at)
  values
    (p_recipe_id, v_locale, v_title,
     nullif(btrim(p_translation->>'description'), ''), nullif(btrim(p_translation->>'notes'), ''),
     v_tags, v_content, v_hash, nullif(btrim(p_translation->>'model'), ''), false, now())
  on conflict (recipe_id, locale) do update set
    title = excluded.title, description = excluded.description, notes = excluded.notes,
    tags = excluded.tags, content = excluded.content, source_hash = excluded.source_hash,
    model = excluded.model, stale = false, translated_at = now();

exception
  when insufficient_privilege then
    raise exception 'Action réservée aux administrateurs' using errcode = '42501';
end;
$$;

comment on function public.save_recipe_translation(uuid, text, jsonb) is
  'Écrit la traduction d''une recette vers l''autre langue que p_lang (langue source, posée sur la recette). SECURITY INVOKER : admin (v1) ou personne qui peut modifier la recette (v2, 0021) ; le RLS tranche en dernier.';
revoke execute on function public.save_recipe_translation(uuid, text, jsonb) from public, anon;
grant  execute on function public.save_recipe_translation(uuid, text, jsonb) to authenticated;


-- ----------------------------------------------------------------------------
-- 3. save_recipe (= 0016 + owner_id / category_id / visibility)
-- ----------------------------------------------------------------------------
create or replace function public.save_recipe(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id          uuid;
  v_title       text;
  v_category    text;
  v_tags        text[];
  v_exists      boolean := false;
  v_sections    jsonb;
  s             jsonb;
  i             jsonb;
  x             jsonb;
  v_section_id  uuid;
  v_type        text;
  s_idx         int := 0;
  i_idx         int;
  v_name        text;
  v_amount      text;
  v_amount_num  numeric;
  v_unit        text;
  v_unit_code   text;
  v_content     text;
  v_lang        text;
  v_tr          jsonb;
  v_visibility  text;
  v_cat_id      uuid;
  v_has_cat     boolean := false;
  v_cat_name    text;
  v_is_owner    boolean := false;
  v_owner_req   boolean := false;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'Payload invalide : un objet JSON est attendu' using errcode = '22023';
  end if;

  v_title    := nullif(btrim(payload->>'title'), '');
  v_category := nullif(btrim(payload->>'category'), '');
  if v_title is null then
    raise exception 'Le titre de la recette est obligatoire' using errcode = '22023';
  end if;
  -- 0021 : `category_id` (catégorie personnelle) et `visibility` facultatifs. Absents (v1) = inchangés.
  v_has_cat := payload ? 'category_id';
  if v_has_cat then
    if jsonb_typeof(payload->'category_id') = 'string' then
      v_cat_id := (payload->>'category_id')::uuid;
    elsif jsonb_typeof(payload->'category_id') <> 'null' then
      raise exception 'category_id doit être un identifiant ou null' using errcode = '22023';
    end if;
  end if;
  v_visibility := nullif(btrim(payload->>'visibility'), '');
  if v_visibility is not null and v_visibility not in ('private', 'groups') then
    raise exception 'Visibilité invalide : % (private ou groups attendu)', v_visibility using errcode = '22023';
  end if;
  if v_category is null and v_cat_id is null then
    raise exception 'La catégorie de la recette est obligatoire' using errcode = '22023';
  end if;

  -- Langue source (0016) : facultative ; absente = inchangée (« fr » à la création).
  v_lang := nullif(btrim(payload->>'lang'), '');
  if v_lang is not null and v_lang not in ('fr', 'en') then
    raise exception 'Langue invalide : % (fr ou en attendu)', v_lang using errcode = '22023';
  end if;
  -- Traduction livrée avec la recette (import IA) : écrite dans la même transaction.
  v_tr := payload->'translation';
  if v_tr is not null and jsonb_typeof(v_tr) not in ('object', 'null') then
    raise exception 'translation doit être un objet JSON' using errcode = '22023';
  end if;
  if jsonb_typeof(v_tr) = 'null' then v_tr := null; end if;

  v_sections := coalesce(payload->'sections', '[]'::jsonb);
  if jsonb_typeof(v_sections) <> 'array' then
    raise exception 'sections doit être un tableau' using errcode = '22023';
  end if;

  if payload ? 'tags' and jsonb_typeof(payload->'tags') = 'array' then
    select coalesce(array_agg(t), '{}'::text[]) into v_tags
      from jsonb_array_elements_text(payload->'tags') t;
  else
    v_tags := '{}'::text[];
  end if;

  v_id := nullif(btrim(payload->>'id'), '')::uuid;
  if v_id is not null then
    select true into v_exists from public.recipes r where r.id = v_id;
    v_exists := coalesce(v_exists, false);
  end if;

  -- 0021 : seul l'auteur (ou, à la création, la personne connectée) range la recette dans SA catégorie et
  -- règle sa visibilité ; un éditeur (edit_original) ne change que le contenu (ces clés sont alors ignorées).
  if v_exists then
    select (r.owner_id is not null and r.owner_id = (select auth.uid())) into v_is_owner
      from public.recipes r where r.id = v_id;
    v_is_owner := coalesce(v_is_owner, false);
  else
    v_is_owner := true;
  end if;
  if v_has_cat and v_is_owner and v_cat_id is not null then
    select coalesce(c.name_fr, c.name_en, c.slug) into v_cat_name
      from public.categories c where c.id = v_cat_id and c.owner_id = (select auth.uid());
    if not found then
      raise exception 'Catégorie inconnue ou qui ne vous appartient pas' using errcode = '22023';
    end if;
    v_category := coalesce(v_category, v_cat_name);
  end if;
  if v_category is null then
    raise exception 'La catégorie de la recette est obligatoire' using errcode = '22023';
  end if;
  -- owner_id explicite seulement une fois la bascule v2/0020 appliquée (colonne NOT NULL) : avant le remplissage
  -- v2/0018, une recette créée en v1 doit rester sans propriétaire pour que 0018 l'attribue à Nina.
  select a.attnotnull into v_owner_req
    from pg_catalog.pg_attribute a
   where a.attrelid = 'public.recipes'::regclass and a.attname = 'owner_id' and not a.attisdropped;

  -- 1. Recette -------------------------------------------------------------
  if v_exists then
    update public.recipes set
      title       = v_title,
      description = payload->>'description',
      category    = v_category,
      prep_time   = (payload->>'prep_time')::int,
      cook_time   = (payload->>'cook_time')::int,
      servings    = (payload->>'servings')::int,
      image       = payload->>'image',
      photo_path  = nullif(btrim(payload->>'photo_path'), ''),
      tags        = v_tags,
      notes       = payload->>'notes',
      lang        = coalesce(v_lang, lang),
      visibility  = case when v_is_owner and v_visibility is not null then v_visibility else visibility end,
      category_id = case when v_is_owner and v_has_cat then v_cat_id else category_id end,
      updated_at  = now()
    where id = v_id;
    if not found then
      raise exception 'Action réservée aux administrateurs' using errcode = '42501';
    end if;
  else
    -- `on conflict do nothing` : un `id` qui existe déjà mais que je ne peux pas LIRE (le RLS cache la ligne, donc `v_exists`
    -- est faux) ne doit pas révéler son existence par une violation de clé primaire : même refus que pour un `id` lisible mais
    -- non modifiable (relecture de sécurité n° 2, CHOIX n° 11).
    insert into public.recipes (id, title, description, category,
                                prep_time, cook_time, servings, image, photo_path, tags, notes, lang,
                                owner_id, visibility, category_id)
    values (coalesce(v_id, gen_random_uuid()), v_title, payload->>'description', v_category,
            (payload->>'prep_time')::int, (payload->>'cook_time')::int, (payload->>'servings')::int,
            payload->>'image', nullif(btrim(payload->>'photo_path'), ''), v_tags, payload->>'notes',
            coalesce(v_lang, 'fr'),
            case when coalesce(v_owner_req, false) then (select auth.uid()) end,
            coalesce(v_visibility, 'groups'), v_cat_id)
    on conflict (id) do nothing
    returning id into v_id;
    if not found then
      raise exception 'Action réservée aux administrateurs' using errcode = '42501';
    end if;
  end if;

  -- 2. Remplacement complet des enfants ---------------------------------------
  delete from public.recipe_ingredients where recipe_id = v_id;
  delete from public.instructions       where recipe_id = v_id;
  delete from public.recipe_sections    where recipe_id = v_id;

  for s in select * from jsonb_array_elements(v_sections) loop
    if jsonb_typeof(s) <> 'object' then
      raise exception 'Chaque section doit être un objet JSON' using errcode = '22023';
    end if;
    v_type := coalesce(nullif(btrim(s->>'type'), ''), 'mixed');
    if v_type not in ('ingredients', 'instructions', 'mixed') then
      raise exception 'Type de section invalide : %', v_type using errcode = '22023';
    end if;

    insert into public.recipe_sections (recipe_id, name, type, order_index)
    values (v_id, coalesce(s->>'name', ''), v_type, coalesce((s->>'order_index')::int, s_idx))
    returning id into v_section_id;

    -- Ingrédients
    i_idx := 0;
    if jsonb_typeof(s->'ingredients') = 'array' then
      for i in select * from jsonb_array_elements(s->'ingredients') loop
        v_name := nullif(btrim(i->>'name'), '');
        if v_name is null then
          raise exception 'Un ingrédient de la section « % » n''a pas de nom', coalesce(s->>'name', '')
            using errcode = '22023';
        end if;
        v_amount     := nullif(btrim(i->>'amount'), '');
        v_amount_num := case when jsonb_typeof(i->'amount_num') = 'number'
                             then (i->>'amount_num')::numeric
                             else public.parse_amount(v_amount) end;
        if v_amount is null and v_amount_num is not null then
          v_amount := public.format_amount(v_amount_num);
        end if;
        v_unit      := nullif(btrim(i->>'unit'), '');
        v_unit_code := coalesce(nullif(btrim(i->>'unit_code'), ''), public.normalize_unit(v_unit));
        if v_unit_code is not null and not exists (select 1 from public.units u where u.code = v_unit_code) then
          raise exception 'Unité inconnue : %', v_unit_code using errcode = '22023';
        end if;
        if v_unit is null and v_unit_code is not null then
          select u.abbr into v_unit from public.units u where u.code = v_unit_code;
        end if;

        insert into public.recipe_ingredients
          (recipe_id, section_id, name, amount, amount_num, unit, unit_code, optional, order_index)
        values
          (v_id, v_section_id, v_name, v_amount, v_amount_num, v_unit, v_unit_code,
           coalesce((i->>'optional')::boolean, false), coalesce((i->>'order_index')::int, i_idx));
        i_idx := i_idx + 1;
      end loop;
    end if;

    -- Instructions (objet {content} ou simple chaîne)
    i_idx := 0;
    if jsonb_typeof(s->'instructions') = 'array' then
      for x in select * from jsonb_array_elements(s->'instructions') loop
        v_content := nullif(btrim(case when jsonb_typeof(x) = 'string' then x #>> '{}' else x->>'content' end), '');
        if v_content is null then
          continue;
        end if;
        insert into public.instructions (recipe_id, section_id, content, order_index)
        values (v_id, v_section_id, v_content,
                coalesce(case when jsonb_typeof(x) = 'object' then (x->>'order_index')::int end, i_idx));
        i_idx := i_idx + 1;
      end loop;
    end if;

    s_idx := s_idx + 1;
  end loop;

  -- 3. Traductions (0016) -------------------------------------------------------
  -- Les enfants viennent d'être recréés (nouveaux identifiants) : les traductions
  -- sont rattachées par POSITION (section / ingrédient / étape), donc elles
  -- survivent. Mais le texte source a pu changer : sans traduction fournie, on
  -- les marque périmées (`stale`) ; l'API les régénère ou les revalide
  -- (hash inchangé) juste après. Un écrit qui oublie cette étape reste sûr :
  -- les lectures ignorent les traductions périmées.
  if v_tr is not null then
    perform public.save_recipe_translation(
      v_id, coalesce(v_lang, (select r.lang from public.recipes r where r.id = v_id)), v_tr);
  elsif v_exists then
    update public.recipe_translations set stale = true where recipe_id = v_id and not stale;
  end if;

  return v_id;

exception
  when insufficient_privilege then
    raise exception 'Action réservée aux administrateurs' using errcode = '42501';
  when invalid_text_representation then
    raise exception 'Valeur invalide dans le payload (identifiant, nombre ou booléen) : %', sqlerrm
      using errcode = '22023';
end;
$$;
comment on function public.save_recipe(jsonb) is
  'Upsert complet d''une recette (recette + sections + ingrédients + instructions + photo_path + lang + traduction facultative + category_id / visibility facultatifs). SECURITY INVOKER : le RLS décide (v1 : admins ; v2 : auteur ou edit_original). 0016 : traductions marquées périmées si le texte est ré-enregistré sans traduction jointe. 0021 : owner_id = auth.uid() à la création (une fois la bascule v2/0020 appliquée) ; category_id / visibility ignorés pour un éditeur qui n''est pas l''auteur.';

revoke execute on function public.save_recipe(jsonb) from public, anon;
grant  execute on function public.save_recipe(jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. copy_recipe — copie modifiable
-- ----------------------------------------------------------------------------
create or replace function public.copy_recipe(p_source uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me   uuid := (select auth.uid());
  v_src  public.recipes%rowtype;
  v_new  uuid;
  v_cat  uuid;
  v_sec  uuid;
  s      record;
begin
  if v_me is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  if p_source is null or not private.can_copy_recipe(p_source) then
    raise exception 'Copie impossible : recette introuvable ou droit insuffisant' using errcode = '42501';
  end if;
  select * into v_src from public.recipes where id = p_source;

  -- catégorie : celle de MES catégories qui porte la même clé que l'originale
  select c2.id into v_cat
    from public.categories c1
    join public.categories c2 on c2.slug = c1.slug and c2.owner_id = v_me
   where c1.id = v_src.category_id;

  insert into public.recipes (title, description, category, prep_time, cook_time, servings, image,
                              tags, notes, lang, owner_id, visibility, copied_from, category_id)
  values (v_src.title, v_src.description, v_src.category, v_src.prep_time, v_src.cook_time, v_src.servings, v_src.image,
          v_src.tags, v_src.notes, v_src.lang, v_me, 'private', p_source, v_cat)
  returning id into v_new;
  -- photo_path volontairement non copié (phase 8)

  for s in select * from public.recipe_sections where recipe_id = p_source order by order_index, created_at loop
    insert into public.recipe_sections (recipe_id, name, type, order_index)
    values (v_new, s.name, s.type, s.order_index)
    returning id into v_sec;
    insert into public.recipe_ingredients (recipe_id, section_id, name, amount, amount_num, unit, unit_code, optional, order_index)
      select v_new, v_sec, i.name, i.amount, i.amount_num, i.unit, i.unit_code, i.optional, i.order_index
        from public.recipe_ingredients i where i.recipe_id = p_source and i.section_id = s.id;
    insert into public.instructions (recipe_id, section_id, content, order_index)
      select v_new, v_sec, n.content, n.order_index
        from public.instructions n where n.recipe_id = p_source and n.section_id = s.id;
  end loop;
  -- lignes sans section (anciennes données), s'il en reste
  insert into public.recipe_ingredients (recipe_id, section_id, name, amount, amount_num, unit, unit_code, optional, order_index)
    select v_new, null, i.name, i.amount, i.amount_num, i.unit, i.unit_code, i.optional, i.order_index
      from public.recipe_ingredients i where i.recipe_id = p_source and i.section_id is null;
  insert into public.instructions (recipe_id, section_id, content, order_index)
    select v_new, null, n.content, n.order_index
      from public.instructions n where n.recipe_id = p_source and n.section_id is null;

  insert into public.recipe_translations (recipe_id, locale, title, description, notes, tags, content,
                                          source_hash, model, stale, translated_at)
    select v_new, t.locale, t.title, t.description, t.notes, t.tags, t.content,
           t.source_hash, t.model, t.stale, t.translated_at
      from public.recipe_translations t where t.recipe_id = p_source;

  return v_new;
end;
$$;
comment on function public.copy_recipe(uuid) is
  'Copie modifiable d''une recette que l''appelant peut copier (niveau copy ou plus) : nouvelle recette à lui (private), copied_from = original, sections / ingrédients / étapes / traductions copiés. Photo NON copiée (phase 8). Renvoie l''id de la copie. 0021.';

-- ----------------------------------------------------------------------------
-- 5. Carnet : add_to_cookbook, remove_from_cookbook, list_cookbook
-- ----------------------------------------------------------------------------
create or replace function public.add_to_cookbook(p_recipe uuid, p_category uuid default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me  uuid := (select auth.uid());
  v_new boolean;
begin
  if v_me is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  if p_recipe is null or not private.can_read_recipe(p_recipe) then
    raise exception 'Recette introuvable ou non partagée avec vous' using errcode = '42501';
  end if;
  if p_category is not null and not exists (select 1 from public.categories c where c.id = p_category and c.owner_id = v_me) then
    raise exception 'Catégorie inconnue ou qui ne vous appartient pas' using errcode = '22023';
  end if;
  if private.is_recipe_owner(p_recipe) then
    return false;   -- mes propres recettes sont déjà dans mon carnet
  end if;
  insert into public.cookbook_entries as e (user_id, recipe_id, category_id)
  values (v_me, p_recipe, p_category)
  on conflict (user_id, recipe_id) do update set category_id = coalesce(excluded.category_id, e.category_id)
  returning (e.xmax = 0) into v_new;
  return coalesce(v_new, false);
end;
$$;
comment on function public.add_to_cookbook(uuid, uuid) is
  'Ajoute une recette lisible au carnet de l''appelant « telle quelle » (référence). Idempotente : true la première fois seulement ; rangée dans une catégorie à lui (facultatif). 0021.';

create or replace function public.remove_from_cookbook(p_recipe uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_n  integer;
begin
  if v_me is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  delete from public.cookbook_entries e where e.user_id = v_me and e.recipe_id = p_recipe;
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;
comment on function public.remove_from_cookbook(uuid) is
  'Retire une recette du carnet de l''appelant. Idempotente : true si une entrée a été retirée. 0021.';

create or replace function public.list_cookbook(
  p_category uuid default null,
  p_query    text default null,
  p_limit    int  default 24,
  p_offset   int  default 0
)
returns table (
  id            uuid,
  title         text,
  description   text,
  category      text,
  category_id   uuid,
  prep_time     integer,
  cook_time     integer,
  servings      integer,
  image         text,
  photo_path    text,
  notes         text,
  tags          text[],
  created_at    timestamptz,
  updated_at    timestamptz,
  lang          text,
  translation   jsonb,
  relation      text,
  permission    text,
  author_id     uuid,
  author_name   text,
  added_at      timestamptz,
  total_count   bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with q as (
    select nullif(btrim(p_query), '') as raw,
           case when nullif(btrim(p_query), '') is null then null
                else websearch_to_tsquery('french'::regconfig, public.immutable_unaccent(btrim(p_query))) end as tsq_fr,
           case when nullif(btrim(p_query), '') is null then null
                else websearch_to_tsquery('english'::regconfig, public.immutable_unaccent(btrim(p_query))) end as tsq_en
  ),
  mine as (
    select r.id as recipe_id, 'owned'::text as relation, r.category_id as eff_category, r.created_at as sort_at
      from public.recipes r
     where r.owner_id = (select auth.uid())
    union all
    select e.recipe_id, 'added'::text, e.category_id, e.created_at
      from public.cookbook_entries e
     where e.user_id = (select auth.uid())
       and not exists (select 1 from public.recipes o where o.id = e.recipe_id and o.owner_id = (select auth.uid()))
  ),
  f as (
    select r.id, r.title, r.description, r.category, m.eff_category, r.prep_time, r.cook_time, r.servings,
           r.image, r.photo_path, r.notes, r.tags, r.created_at, r.updated_at, r.lang, r.owner_id,
           m.relation, m.sort_at, lv.lvl,
           case when tr.stale is false then
             jsonb_build_object('locale', tr.locale, 'title', tr.title, 'description', tr.description,
                                'notes', tr.notes, 'tags', to_jsonb(tr.tags))
           end as translation,
           greatest(
             case when s.src_q is not null and numnode(s.src_q) > 0 and r.search @@ s.src_q
                  then ts_rank(r.search, s.src_q) else 0::real end,
             case when tr.locale is not null and s.tr_q is not null and numnode(s.tr_q) > 0 and tr.search @@ s.tr_q
                  then ts_rank(tr.search, s.tr_q) else 0::real end
           ) as rank
      from mine m
      join public.recipes r on r.id = m.recipe_id
      cross join q
      cross join lateral (select private.recipe_level(r.id) as lvl) lv
      left join lateral (
        select t.locale, t.title, t.description, t.notes, t.tags, t.stale, t.search
          from public.recipe_translations t
         where t.recipe_id = r.id
         order by t.translated_at desc
         limit 1
      ) tr on true
      cross join lateral (
        select case when r.lang = 'en' then q.tsq_en else q.tsq_fr end as src_q,
               case when tr.locale = 'en' then q.tsq_en else q.tsq_fr end as tr_q
      ) s
     where lv.lvl >= 1
       and (p_category is null or m.eff_category = p_category)
       and (q.raw is null
            or (s.src_q is not null and numnode(s.src_q) > 0 and r.search @@ s.src_q)
            or (tr.locale is not null and s.tr_q is not null and numnode(s.tr_q) > 0 and tr.search @@ s.tr_q)
            or public.immutable_unaccent(r.title) ilike '%' || public.immutable_unaccent(q.raw) || '%'
            or (tr.locale is not null
                and public.immutable_unaccent(tr.title) ilike '%' || public.immutable_unaccent(q.raw) || '%'))
  )
  select f.id, f.title, f.description, f.category, f.eff_category, f.prep_time, f.cook_time, f.servings,
         f.image, f.photo_path, f.notes, f.tags, f.created_at, f.updated_at, f.lang, f.translation,
         f.relation,
         case f.lvl when 4 then 'author' when 3 then 'edit_original' when 2 then 'copy' else 'read' end,
         f.owner_id, pr.display_name, f.sort_at,
         count(*) over () as total_count
    from f
    left join public.profiles pr on pr.id = f.owner_id
   order by f.rank desc, f.sort_at desc, f.id
   limit greatest(1, least(coalesce(p_limit, 24), 100))
  offset greatest(0, coalesce(p_offset, 0))
$$;
comment on function public.list_cookbook(uuid, text, int, int) is
  'Carnet de l''appelant : ses recettes (owned) + celles qu''il a ajoutées et qu''il peut encore lire (added), avec son niveau de droit, la catégorie (la sienne pour owned, son rangement pour added) et les champs de carte de search_recipes (lang + translation). Filtre catégorie, recherche plein texte facultative, paginée, total_count. 0021.';

-- ----------------------------------------------------------------------------
-- 6. Listes : recettes d'un auteur, partagées avec moi
-- ----------------------------------------------------------------------------
create or replace function public.list_author_recipes(
  p_author uuid,
  p_limit  int default 24,
  p_offset int default 0
)
returns table (
  id            uuid,
  title         text,
  description   text,
  category      text,
  prep_time     integer,
  cook_time     integer,
  servings      integer,
  image         text,
  photo_path    text,
  notes         text,
  tags          text[],
  created_at    timestamptz,
  updated_at    timestamptz,
  lang          text,
  translation   jsonb,
  permission    text,
  in_cookbook   boolean,
  author_id     uuid,
  author_name   text,
  total_count   bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.title, r.description, r.category, r.prep_time, r.cook_time, r.servings,
         r.image, r.photo_path, r.notes, r.tags, r.created_at, r.updated_at, r.lang,
         private.translation_card(r.id),
         case lv.lvl when 4 then 'author' when 3 then 'edit_original' when 2 then 'copy' else 'read' end,
         exists (select 1 from public.cookbook_entries e where e.user_id = (select auth.uid()) and e.recipe_id = r.id),
         r.owner_id, pr.display_name,
         count(*) over () as total_count
    from public.recipes r
    cross join lateral (select private.recipe_level(r.id) as lvl) lv
    left join public.profiles pr on pr.id = r.owner_id
   where (select auth.uid()) is not null
     and p_author is not null
     and r.owner_id = p_author
     and p_author <> (select auth.uid())
     and lv.lvl >= 1
   order by r.created_at desc, r.id
   limit greatest(1, least(coalesce(p_limit, 24), 100))
  offset greatest(0, coalesce(p_offset, 0))
$$;
comment on function public.list_author_recipes(uuid, int, int) is
  'Page « Explorer les recettes de X » : les recettes de l''auteur que l''appelant peut lire, avec son niveau de droit et « déjà dans mon carnet ». Vide pour soi-même ou si rien n''est lisible. 0021.';

create or replace function public.list_shared_with_me(
  p_limit  int default 24,
  p_offset int default 0
)
returns table (
  id            uuid,
  title         text,
  description   text,
  category      text,
  prep_time     integer,
  cook_time     integer,
  servings      integer,
  image         text,
  photo_path    text,
  notes         text,
  tags          text[],
  created_at    timestamptz,
  updated_at    timestamptz,
  lang          text,
  translation   jsonb,
  permission    text,
  via           text,
  author_id     uuid,
  author_name   text,
  total_count   bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.title, r.description, r.category, r.prep_time, r.cook_time, r.servings,
         r.image, r.photo_path, r.notes, r.tags, r.created_at, r.updated_at, r.lang,
         private.translation_card(r.id),
         case lv.lvl when 4 then 'author' when 3 then 'edit_original' when 2 then 'copy' else 'read' end,
         case when exists (select 1 from public.recipe_grants g
                            where g.recipe_id = r.id and g.grantee_user_id = (select auth.uid()))
              then 'user' else 'group' end,
         r.owner_id, pr.display_name,
         count(*) over () as total_count
    from public.recipes r
    cross join lateral (select private.recipe_level(r.id) as lvl) lv
    left join public.profiles pr on pr.id = r.owner_id
   where (select auth.uid()) is not null
     and r.owner_id is not null
     and r.owner_id <> (select auth.uid())
     and lv.lvl >= 1
     and not exists (select 1 from public.cookbook_entries e
                      where e.user_id = (select auth.uid()) and e.recipe_id = r.id)
   order by r.created_at desc, r.id
   limit greatest(1, least(coalesce(p_limit, 24), 100))
  offset greatest(0, coalesce(p_offset, 0))
$$;
comment on function public.list_shared_with_me(int, int) is
  'Recettes d''autres personnes que l''appelant peut lire (droit direct, droit d''un de ses groupes, ou partage implicite « groupes ») et qu''il n''a pas encore ajoutées à son carnet. via = user (droit à son nom) | group. 0021.';

-- ----------------------------------------------------------------------------
-- 7. Droits : grant_recipe, revoke_recipe_grant, reshare_recipe, list_recipe_grants
-- ----------------------------------------------------------------------------
create or replace function public.grant_recipe(
  p_recipe        uuid,
  p_grantee_user  uuid default null,
  p_grantee_group uuid default null,
  p_permission    text default 'copy'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_id uuid;
begin
  if v_me is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  if p_permission is null or p_permission not in ('read', 'copy', 'edit_original') then
    raise exception 'Droit invalide : % (read, copy ou edit_original attendu)', coalesce(p_permission, 'NULL') using errcode = '22023';
  end if;
  if (p_grantee_user is null) = (p_grantee_group is null) then
    raise exception 'Indiquez une personne OU un groupe' using errcode = '22023';
  end if;
  if p_recipe is null or not private.is_recipe_owner(p_recipe) then
    raise exception 'Réservé à l''auteur de la recette' using errcode = '42501';
  end if;
  if not private.can_create_grant(p_recipe, p_grantee_user, p_grantee_group, p_permission, 'direct', null, v_me) then
    raise exception 'Droit refusé : la personne doit être un ami ou partager l''un de vos groupes, ou vous devez être membre du groupe' using errcode = '42501';
  end if;

  if p_grantee_user is not null then
    insert into public.recipe_grants as g (recipe_id, grantee_user_id, permission, granted_by, origin)
    values (p_recipe, p_grantee_user, p_permission, v_me, 'direct')
    on conflict (recipe_id, grantee_user_id) where grantee_user_id is not null
    do update set permission = excluded.permission, granted_by = excluded.granted_by,
                  origin = 'direct', source_grant_id = null
    returning g.id into v_id;
  else
    insert into public.recipe_grants as g (recipe_id, grantee_group_id, permission, granted_by, origin)
    values (p_recipe, p_grantee_group, p_permission, v_me, 'direct')
    on conflict (recipe_id, grantee_group_id) where grantee_group_id is not null
    do update set permission = excluded.permission, granted_by = excluded.granted_by,
                  origin = 'direct', source_grant_id = null
    returning g.id into v_id;
  end if;
  return v_id;
end;
$$;
comment on function public.grant_recipe(uuid, uuid, uuid, text) is
  'L''AUTEUR donne (ou remplace) un droit read | copy | edit_original à une personne (amie ou de l''un de ses groupes) OU à un groupe dont il est membre. Renvoie l''id du droit. 0021.';

create or replace function public.revoke_recipe_grant(p_grant_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_n  integer;
begin
  if v_me is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  -- mêmes règles que la politique de suppression de recipe_grants (0019) ; les repartages issus de ce droit suivent (cascade)
  delete from public.recipe_grants g
   where g.id = p_grant_id
     and (private.is_recipe_owner(g.recipe_id)
          or (g.origin = 'reshare' and g.granted_by = v_me)
          or g.grantee_user_id = v_me);
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;
comment on function public.revoke_recipe_grant(uuid) is
  'Retire un droit : par l''auteur, par l''auteur d''un repartage, ou par la personne qui y renonce. Les repartages qui en découlent disparaissent. true si retiré, false sinon (inconnu ou non permis, sans distinction). 0021.';

create or replace function public.reshare_recipe(
  p_recipe        uuid,
  p_grantee_user  uuid default null,
  p_grantee_group uuid default null,
  p_permission    text default 'read'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me     uuid := (select auth.uid());
  v_source uuid;
  v_owner  uuid;
  v_ex     record;
  v_id     uuid;
begin
  if v_me is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  if p_permission = 'edit_original' then
    raise exception 'Un repartage ne donne jamais le droit de modifier l''original' using errcode = '22023';
  end if;
  if p_permission is null or p_permission not in ('read', 'copy') then
    raise exception 'Droit invalide : % (read ou copy attendu)', coalesce(p_permission, 'NULL') using errcode = '22023';
  end if;
  if p_grantee_group is not null then
    raise exception 'Un repartage ne vise qu''une personne (un ami ou un membre d''un de vos groupes), jamais un groupe' using errcode = '22023';
  end if;
  if p_grantee_user is null then
    raise exception 'Indiquez la personne à qui repartager' using errcode = '22023';
  end if;

  -- le droit EXPLICITE le plus haut que je détiens (direct, ou via un groupe dont je suis membre)
  select g.id into v_source
    from public.recipe_grants g
   where g.recipe_id = p_recipe
     and (g.grantee_user_id = v_me
          or g.grantee_group_id in (select m.group_id from public.group_members m where m.user_id = v_me))
   order by private.permission_rank(g.permission) desc, (g.origin = 'direct') desc, g.created_at
   limit 1;
  if v_source is null then
    raise exception 'Repartage impossible : seul un droit reçu explicitement se repartage' using errcode = '42501';
  end if;
  if not private.can_create_grant(p_recipe, p_grantee_user, p_grantee_group, p_permission, 'reshare', v_source, v_me) then
    raise exception 'Repartage refusé : niveau supérieur au vôtre, ou personne / groupe hors de vos amis et groupes' using errcode = '42501';
  end if;

  select r.owner_id into v_owner from public.recipes r where r.id = p_recipe;
  if p_grantee_user is not null and p_grantee_user = v_owner then
    return null;   -- l'auteur n'a pas besoin d'un droit sur sa propre recette
  end if;

  select g.id, g.origin, g.granted_by into v_ex
    from public.recipe_grants g
   where g.recipe_id = p_recipe
     and ((p_grantee_user is not null and g.grantee_user_id = p_grantee_user)
          or (p_grantee_group is not null and g.grantee_group_id = p_grantee_group));
  if not found then
    insert into public.recipe_grants (recipe_id, grantee_user_id, grantee_group_id, permission, granted_by, source_grant_id, origin)
    values (p_recipe, p_grantee_user, p_grantee_group, p_permission, v_me, v_source, 'reshare')
    returning id into v_id;
  elsif v_ex.origin = 'reshare' and v_ex.granted_by = v_me then
    update public.recipe_grants set permission = p_permission, source_grant_id = v_source
     where id = v_ex.id returning id into v_id;
  else
    v_id := null;   -- un droit existe déjà et n'est pas le mien : on ne le remplace jamais
  end if;
  return v_id;
end;
$$;
comment on function public.reshare_recipe(uuid, uuid, uuid, text) is
  'Repartage d''un droit reçu explicitement : read ou copy seulement (jamais edit_original), au plus le niveau de l''appelant, à UNE PERSONNE seulement (ami ou membre d''un de ses groupes ; jamais un groupe, erreur 22023). Ne remplace jamais un droit qui n''est pas le sien (renvoie NULL). 0021.';

create or replace function public.list_recipe_grants(p_recipe uuid)
returns table (
  grant_id         uuid,
  grantee_user_id  uuid,
  grantee_group_id uuid,
  grantee_name     text,
  permission       text,
  origin           text,
  source_grant_id  uuid,
  granted_by       uuid,
  granted_by_name  text,
  created_at       timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  if p_recipe is null or not private.is_recipe_owner(p_recipe) then
    raise exception 'Réservé à l''auteur de la recette' using errcode = '42501';
  end if;
  return query
    select g.id, g.grantee_user_id, g.grantee_group_id,
           coalesce(pu.display_name, gr.name),
           g.permission, g.origin, g.source_grant_id, g.granted_by, pb.display_name, g.created_at
      from public.recipe_grants g
      left join public.profiles pu on pu.id = g.grantee_user_id
      left join public.groups gr on gr.id = g.grantee_group_id
      left join public.profiles pb on pb.id = g.granted_by
     where g.recipe_id = p_recipe
     order by g.created_at, g.id;
end;
$$;
comment on function public.list_recipe_grants(uuid) is
  'Droits donnés sur une recette (personnes et groupes, repartages compris, avec le nom d''affichage). Réservé à l''auteur. Jamais d''e-mail. 0021.';

-- ----------------------------------------------------------------------------
-- 8. Lien public : create_share_link, revoke_share_link, claim_shared_recipe, get_shared_recipe
-- ----------------------------------------------------------------------------
create or replace function public.create_share_link(p_recipe uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  if p_recipe is null or not private.is_recipe_owner(p_recipe) then
    raise exception 'Réservé à l''auteur de la recette' using errcode = '42501';
  end if;
  insert into public.recipe_share_links (recipe_id) values (p_recipe) on conflict (recipe_id) do nothing;
  select l.token into v_token from public.recipe_share_links l where l.recipe_id = p_recipe;
  return v_token;
end;
$$;
comment on function public.create_share_link(uuid) is
  'Active le lien public de la recette (auteur seulement) et renvoie son jeton ; renvoie le jeton existant s''il y en a déjà un. 0021.';

create or replace function public.revoke_share_link(p_recipe uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  if p_recipe is null or not private.is_recipe_owner(p_recipe) then
    raise exception 'Réservé à l''auteur de la recette' using errcode = '42501';
  end if;
  delete from public.recipe_share_links l where l.recipe_id = p_recipe;
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;
comment on function public.revoke_share_link(uuid) is
  'Désactive le lien public (auteur seulement). true si un lien existait. Les personnes qui ont déjà ajouté la recette gardent leur accès (dossier §2.5). 0021.';

create or replace function public.claim_shared_recipe(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me     uuid := (select auth.uid());
  v_recipe uuid;
  v_owner  uuid;
begin
  if v_me is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  select l.recipe_id, r.owner_id into v_recipe, v_owner
    from public.recipe_share_links l join public.recipes r on r.id = l.recipe_id
   where l.token = p_token;
  if not found or v_owner is null then
    raise exception 'Lien introuvable ou désactivé' using errcode = 'P0002';
  end if;
  if v_owner = v_me then
    return v_recipe;   -- c'est ma recette
  end if;
  -- un droit existe déjà pour cette personne et cette recette : on n'y touche JAMAIS (ni hausse, ni baisse, ni changement
  -- d'origine ou de source) ; la fonction n'ajoute alors que l'entrée de carnet
  insert into public.recipe_grants as g (recipe_id, grantee_user_id, permission, granted_by, origin)
  values (v_recipe, v_me, 'copy', v_owner, 'link')
  on conflict (recipe_id, grantee_user_id) where grantee_user_id is not null
  do nothing;
  insert into public.cookbook_entries (user_id, recipe_id) values (v_me, v_recipe)
  on conflict (user_id, recipe_id) do nothing;
  return v_recipe;
end;
$$;
comment on function public.claim_shared_recipe(uuid) is
  'Depuis la page publique, après connexion : crée le droit copy (origin link) de l''appelant et ajoute la recette à son carnet. Lien inconnu ou révoqué : erreur P0002. Si un droit existe déjà pour cette personne et cette recette, il n''est pas modifié (seule l''entrée de carnet est ajoutée). Renvoie l''id de la recette. 0021.';

create or replace function public.get_shared_recipe(p_token uuid, p_locale text default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'title', r.title,
           'description', r.description,
           'category', r.category,
           'prep_time', r.prep_time,
           'cook_time', r.cook_time,
           'servings', r.servings,
           'tags', to_jsonb(coalesce(r.tags, '{}'::text[])),
           'notes', r.notes,
           'lang', r.lang,
           'has_photo', r.photo_path is not null,
           'author_name', pr.display_name,
           'sections', coalesce((
              select jsonb_agg(jsonb_build_object(
                       'name', s.name,
                       'type', s.type,
                       'order_index', s.order_index,
                       'ingredients', coalesce((
                          select jsonb_agg(jsonb_build_object(
                                   'name', i.name, 'amount', i.amount, 'amount_num', i.amount_num,
                                   'unit', i.unit, 'unit_code', i.unit_code, 'optional', coalesce(i.optional, false))
                                 order by i.order_index, i.created_at)
                            from public.recipe_ingredients i where i.section_id = s.id), '[]'::jsonb),
                       'instructions', coalesce((
                          select jsonb_agg(to_jsonb(n.content) order by n.order_index, n.created_at)
                            from public.instructions n where n.section_id = s.id), '[]'::jsonb))
                     order by s.order_index, s.created_at)
                from public.recipe_sections s where s.recipe_id = r.id), '[]'::jsonb),
           'translation', (
              select jsonb_build_object('locale', t.locale, 'title', t.title, 'description', t.description,
                                        'notes', t.notes, 'tags', to_jsonb(t.tags), 'content', t.content)
                from public.recipe_translations t
               where t.recipe_id = r.id and not t.stale and (p_locale is null or t.locale = p_locale)
               order by t.translated_at desc
               limit 1)
         )
    from public.recipe_share_links l
    join public.recipes r on r.id = l.recipe_id
    left join public.profiles pr on pr.id = r.owner_id
   where l.token = p_token
$$;
comment on function public.get_shared_recipe(uuid, text) is
  'Page publique /r/<jeton> : la recette complète (sections, ingrédients, étapes, traduction non périmée selon la locale) pour un jeton actif, sinon NULL. Aucun identifiant (ni recette ni auteur), aucun e-mail ; seulement le pseudonyme de l''auteur. Exécutable sans compte. 0021.';

-- ----------------------------------------------------------------------------
-- 9. Suppression : recipe_usage
-- ----------------------------------------------------------------------------
create or replace function public.recipe_usage(p_recipe uuid)
returns table (cookbook_count integer, copy_count integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  if p_recipe is null or not private.is_recipe_owner(p_recipe) then
    raise exception 'Réservé à l''auteur de la recette' using errcode = '42501';
  end if;
  return query
    select (select count(*)::integer from public.cookbook_entries e
             where e.recipe_id = p_recipe and e.user_id <> v_me),
           (select count(*)::integer from public.recipes c
             where c.copied_from = p_recipe and c.owner_id is distinct from v_me);
end;
$$;
comment on function public.recipe_usage(uuid) is
  'Avant de supprimer une recette : combien de carnets d''AUTRES personnes la contiennent et combien d''autres personnes en ont fait une copie. Réservé à l''auteur. 0021.';

-- ----------------------------------------------------------------------------
-- 10. Bannières : pending_prompts, dismiss_prompt (calculées à la volée, voir CHOIX n° 8)
-- ----------------------------------------------------------------------------
create or replace function public.pending_prompts(p_since timestamptz default null, p_limit int default 20)
returns table (
  kind         text,
  target_id    uuid,
  author_id    uuid,
  author_name  text,
  recipe_count integer,
  recipe_id    uuid,
  title        text,
  created_at   timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with common as (   -- co-membres de mes groupes, avec la date où nous sommes tous deux dans ce groupe
    select b.user_id as author_id, greatest(a.created_at, b.created_at) as since_at
      from public.group_members a
      join public.group_members b on b.group_id = a.group_id and b.user_id <> a.user_id
     where a.user_id = (select auth.uid())
  ),
  p as (
    -- « Explorer les recettes de X »
    select 'author_recipes'::text as kind, x.author_id as target_id, x.author_id, pr.display_name as author_name,
           x.n::integer as recipe_count, null::uuid as recipe_id, null::text as title, x.last_at as created_at
      from (
        select r.owner_id as author_id, count(*) as n, max(r.created_at) as last_at
          from public.recipes r
         where r.owner_id in (select c.author_id from common c)
           and private.recipe_level(r.id) >= 1
           and not exists (select 1 from public.cookbook_entries e
                            where e.user_id = (select auth.uid()) and e.recipe_id = r.id)
         group by r.owner_id
      ) x
      left join public.profiles pr on pr.id = x.author_id
     where not exists (select 1 from public.dismissed_prompts d
                        where d.user_id = (select auth.uid()) and d.kind = 'author_recipes' and d.target_id = x.author_id)
    union all
    -- « X a publié une recette » (créée après notre arrivée commune dans un groupe)
    select 'new_recipe'::text, r.id, r.owner_id, pr.display_name, 1, r.id, r.title, r.created_at
      from public.recipes r
      left join public.profiles pr on pr.id = r.owner_id
     where r.owner_id in (select c.author_id from common c)
       and exists (select 1 from common c where c.author_id = r.owner_id and r.created_at > c.since_at)
       and private.recipe_level(r.id) >= 1
       and (p_since is null or r.created_at > p_since)
       and not exists (select 1 from public.cookbook_entries e
                        where e.user_id = (select auth.uid()) and e.recipe_id = r.id)
       and not exists (select 1 from public.dismissed_prompts d
                        where d.user_id = (select auth.uid()) and d.kind = 'new_recipe' and d.target_id = r.id)
  )
  select p.kind, p.target_id, p.author_id, p.author_name, p.recipe_count, p.recipe_id, p.title, p.created_at
    from p
   where (select auth.uid()) is not null
   order by p.created_at desc, p.target_id
   limit greatest(1, least(coalesce(p_limit, 20), 100))
$$;
comment on function public.pending_prompts(timestamptz, int) is
  'Bannières à afficher, calculées à la volée (rien n''est écrit) : author_recipes (« Explorer les recettes de X ») et new_recipe (« X a publié… ») pour les co-membres de mes groupes, hors bannières fermées (dismissed_prompts) et recettes déjà dans mon carnet. 0021.';

create or replace function public.dismiss_prompt(p_kind text, p_target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('author_recipes', 'new_recipe') or p_target is null then
    raise exception 'Bannière invalide' using errcode = '22023';
  end if;
  insert into public.dismissed_prompts (user_id, kind, target_id) values (v_me, p_kind, p_target)
  on conflict do nothing;
end;
$$;
comment on function public.dismiss_prompt(text, uuid) is
  'Ferme une bannière pour de bon (idempotente). Ne modifie pas le carnet. 0021.';

-- ----------------------------------------------------------------------------
-- 11. Droits d'exécution : authenticated (+ service_role) ; get_shared_recipe aussi pour anon
-- ----------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig, p.proname
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname in ('copy_recipe', 'add_to_cookbook', 'remove_from_cookbook', 'list_cookbook',
                                'list_author_recipes', 'list_shared_with_me', 'grant_recipe', 'revoke_recipe_grant',
                                'reshare_recipe', 'list_recipe_grants', 'create_share_link', 'revoke_share_link',
                                'claim_shared_recipe', 'get_shared_recipe', 'recipe_usage', 'pending_prompts',
                                'dismiss_prompt') loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    if r.proname = 'get_shared_recipe' then
      execute format('grant execute on function %s to anon, authenticated, service_role', r.sig);
    else
      execute format('grant execute on function %s to authenticated, service_role', r.sig);
    end if;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 12. Vérifications finales
-- ----------------------------------------------------------------------------
do $$
declare b record; r record; n integer;
begin
  select * into b from private.tmp_0021_before;
  assert (select count(*) from public.recipes) = b.n_recipes and (select count(*) from public.profiles) = b.n_profiles
     and (select count(*) from public.recipe_grants) = b.n_grants and (select count(*) from public.cookbook_entries) = b.n_entries,
    '[0021] des données ont changé';

  -- sans effet pour la v1 : AUCUNE politique (public + storage) n'a changé ; aucune autre fonction publique non plus
  assert (select md5(coalesce(string_agg(
                concat_ws('|', schemaname, tablename, policyname, cmd, roles::text, qual, with_check),
                E'\n' order by schemaname, tablename, policyname), ''))
            from pg_policies where schemaname in ('public', 'storage')) = b.policies_md5,
    '[0021] une politique a changé';
  assert (select md5(coalesce(string_agg(pg_get_functiondef(p.oid), E'\n' order by p.oid::regprocedure::text), ''))
            from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
           where ns.nspname = 'public'
             and p.proname not in ('save_recipe', 'save_recipe_translation',
                                   'copy_recipe', 'add_to_cookbook', 'remove_from_cookbook', 'list_cookbook',
                                   'list_author_recipes', 'list_shared_with_me', 'grant_recipe', 'revoke_recipe_grant',
                                   'reshare_recipe', 'list_recipe_grants', 'create_share_link', 'revoke_share_link',
                                   'claim_shared_recipe', 'get_shared_recipe', 'recipe_usage', 'pending_prompts',
                                   'dismiss_prompt')) = b.functions_md5,
    '[0021] une fonction existante du schéma public a changé';

  -- save_recipe et save_recipe_translation : même signature, même retour, mêmes droits, toujours SECURITY INVOKER
  assert (select string_agg(concat_ws('|', p.oid::regprocedure::text, pg_get_function_result(p.oid), p.prosecdef,
                                      p.provolatile, coalesce(p.proconfig::text, ''), coalesce(p.proacl::text, '')),
                            E'\n' order by p.oid::regprocedure::text)
            from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
           where ns.nspname = 'public' and p.proname in ('save_recipe', 'save_recipe_translation')) = b.replaced_sig,
    '[0021] la signature, le retour ou les droits de save_recipe / save_recipe_translation ont changé';
  assert not has_function_privilege('anon', 'public.save_recipe(jsonb)', 'execute')
     and has_function_privilege('authenticated', 'public.save_recipe(jsonb)', 'execute'), '[0021] droits save_recipe';

  -- 17 nouvelles fonctions : security definer, search_path vide, jamais PUBLIC ; anon seulement pour get_shared_recipe
  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname in ('copy_recipe', 'add_to_cookbook', 'remove_from_cookbook', 'list_cookbook',
                       'list_author_recipes', 'list_shared_with_me', 'grant_recipe', 'revoke_recipe_grant',
                       'reshare_recipe', 'list_recipe_grants', 'create_share_link', 'revoke_share_link',
                       'claim_shared_recipe', 'get_shared_recipe', 'recipe_usage', 'pending_prompts', 'dismiss_prompt');
  assert n = 17, format('[0021] 17 fonctions attendues, %s trouvées (surcharge ?)', n);
  for r in select p.oid, p.proname, p.prosecdef, p.proconfig
             from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
            where ns.nspname = 'public'
              and p.proname in ('copy_recipe', 'add_to_cookbook', 'remove_from_cookbook', 'list_cookbook',
                                'list_author_recipes', 'list_shared_with_me', 'grant_recipe', 'revoke_recipe_grant',
                                'reshare_recipe', 'list_recipe_grants', 'create_share_link', 'revoke_share_link',
                                'claim_shared_recipe', 'get_shared_recipe', 'recipe_usage', 'pending_prompts', 'dismiss_prompt') loop
    assert r.prosecdef, format('[0021] %s n''est pas security definer', r.proname);
    assert r.proconfig is not null and 'search_path=""' = any (r.proconfig), format('[0021] %s : search_path non vide', r.proname);
    assert has_function_privilege('authenticated', r.oid, 'execute'), format('[0021] %s : authenticated sans droit', r.proname);
    assert has_function_privilege('anon', r.oid, 'execute') = (r.proname = 'get_shared_recipe'),
      format('[0021] %s : droit anon inattendu', r.proname);
    assert not exists (select 1 from pg_proc x, aclexplode(coalesce(x.proacl, acldefault('f', x.proowner))) a
                        where x.oid = r.oid and a.grantee = 0), format('[0021] %s : exécutable par PUBLIC', r.proname);
  end loop;
  assert not has_function_privilege('authenticated', 'private.translation_card(uuid)', 'execute')
     and not has_function_privilege('anon', 'private.translation_card(uuid)', 'execute'), '[0021] translation_card ouverte à l''API';

  raise notice '[0021] 17 fonctions publiques nouvelles + 2 remplacées (compatibles) ; politiques et autres fonctions inchangées';
end $$;

drop table if exists private.tmp_0021_before;

notify pgrst, 'reload schema';

commit;
