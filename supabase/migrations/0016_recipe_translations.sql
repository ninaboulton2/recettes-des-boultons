-- ============================================================================
--  0016 — Recettes bilingues : langue source + traductions (fr / en)
-- ============================================================================
--  QUAND : en production, AVANT le déploiement du code bilingue (le nouveau
--  code tolère l'absence de traductions : tant que rien n'est traduit, le site
--  affiche le texte d'origine). Ordre : 0016 → déploiement → lancement de la
--  traduction des recettes existantes (page /admin/traductions). Voir
--  supabase/BASCULE_PROD.md, « Recettes bilingues ».
--  L'ANCIEN code (avant cette migration) continue de fonctionner : colonnes et
--  paramètres ajoutés avec des valeurs par défaut, `search_recipes` ne fait
--  que gagner deux colonnes de fin.
--
--  QUOI
--   1. `units.abbr_en` : abréviation anglaise de chaque unité (c. à s. → tbsp),
--      pour afficher l'unité dans la langue de l'interface.
--   2. `recipes.lang` ('fr' | 'en', défaut 'fr') : langue du texte SAISI. Les
--      recettes existantes reçoivent 'fr' ; la traduction IA des recettes
--      existantes détecte la langue réelle et la corrige (RPC ci-dessous).
--      `recipes.search` (colonne générée) est recréée : stemming français si
--      lang = 'fr', anglais si lang = 'en'.
--   3. Table `recipe_translations` (recipe_id, locale) : traduction VERS
--      `locale` (toujours l'autre langue que `recipes.lang`) : titre,
--      description, notes, tags, `content` jsonb, `source_hash`, `model`,
--      `translated_at`, `stale`, `search` (tsvector généré). RLS : lecture
--      publique (comme `recipes`), écriture admin (`private.is_admin()`).
--      Suppression en cascade avec la recette.
--   4. `content` = les textes des sections PAR POSITION :
--        { "sections": [ { "name": "…",
--                          "ingredients": [ { "name": "…", "amount": "…"|null, "unit": "…"|null } ],
--                          "instructions": [ "…" ] } ] }
--      (section n° i dans l'ordre `order_index`, ingrédient n° j de la
--      section, étape n° k). POURQUOI PAR POSITION : `save_recipe` recrée les
--      sections, ingrédients et étapes (nouveaux identifiants) à chaque
--      enregistrement ; des identifiants dans `content` seraient orphelins dès
--      la première modification. Par position, la traduction survit à
--      `save_recipe`. Garde-fous : (a) `save_recipe` marque `stale = true`
--      toute traduction existante quand le texte est ré-enregistré sans
--      traduction jointe ; l'API la régénère (IA) ou la revalide (hash
--      inchangé) ; (b) l'application n'affiche une traduction que si elle n'est
--      pas périmée ET si sa forme (nombre de sections / ingrédients / étapes)
--      correspond à la recette. `source_hash` (hash des textes sources, calculé
--      par l'application) permet de détecter une traduction périmée.
--   5. `public.save_recipe_translation(recipe_id, lang, translation jsonb)` :
--      pose `recipes.lang`, supprime la traduction vers la langue source
--      (cas d'une langue source corrigée), écrit la traduction (stale = false).
--   6. `public.save_recipe` : accepte `lang` et `translation` dans le payload
--      (import IA : recette + traduction dans UNE transaction) ; marque les
--      traductions périmées sinon. Même signature, mêmes droits.
--   7. `public.search_recipes` : cherche dans le texte d'origine ET dans la
--      traduction (titre, description, noms d'ingrédients traduits) ; renvoie
--      en plus `lang` et `translation` (jsonb : locale, title, description,
--      notes, tags ; null si absente ou périmée). Mêmes paramètres.
--   8. `public.add_recipe_to_list(…, p_locale)` : paramètre facultatif ; avec
--      'fr' ou 'en', les articles ajoutés portent le nom traduit si la
--      recette a une traduction valide vers cette langue.
--
--  RÉVERSIBILITÉ : supabase/rollback/0016_recipe_translations_down.sql
--  (restaure save_recipe / search_recipes / add_recipe_to_list d'avant, supprime
--  la table, `lang` et `abbr_en`).
--
--  IDEMPOTENTE : rejouable (if not exists, create or replace, drop if exists).
--  Rejouer 0013 (setup.sh) puis 0016 donne le même état final.
--
--  COMPTES ATTENDUS : aucune ligne de recettes / sections / ingrédients /
--  étapes ne change ; `recipe_translations` est vide à la création.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0. Pré-requis
-- ----------------------------------------------------------------------------
do $$
begin
  assert to_regclass('public.recipe_sections') is not null, '[0016] recipe_sections absente';
  assert not exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name = 'recipes' and column_name = 'ingredients'),
    '[0016] appliquer 0013 d''abord (colonnes JSONB encore présentes)';
  assert to_regprocedure('private.is_admin()') is not null, '[0016] private.is_admin() absente : appliquer 0009';
  assert to_regclass('public.units') is not null, '[0016] units absente : appliquer 0003';
end $$;

create temporary table tmp_0016_before on commit drop as
  select (select count(*) from public.recipes)            as n_recipes,
         (select count(*) from public.recipe_sections)    as n_sections,
         (select count(*) from public.recipe_ingredients) as n_ingredients,
         (select count(*) from public.instructions)       as n_instructions;

-- ----------------------------------------------------------------------------
-- 1. Unités : abréviation anglaise
-- ----------------------------------------------------------------------------
alter table public.units add column if not exists abbr_en text;

update public.units u set abbr_en = v.abbr_en
  from (values
    ('g', 'g'), ('kg', 'kg'), ('mg', 'mg'), ('ml', 'ml'), ('cl', 'cl'), ('dl', 'dl'), ('l', 'l'),
    ('cas', 'tbsp'), ('cac', 'tsp'), ('verre', 'glass'), ('tasse', 'cup'), ('goutte', 'drop'),
    ('piece', 'piece'), ('tranche', 'slice'), ('gousse', 'clove'), ('sachet', 'sachet'),
    ('bouquet', 'bunch'), ('feuille', 'leaf'), ('boite', 'can'), ('pot', 'jar'), ('cube', 'cube'),
    ('botte', 'bunch'), ('brin', 'sprig'), ('branche', 'stalk'), ('tige', 'stem'), ('zeste', 'zest'),
    ('poignee', 'handful'), ('paquet', 'pack'), ('bouteille', 'bottle'), ('tube', 'tube'),
    ('tete', 'head'), ('dosette', 'pod'), ('portion', 'serving'), ('morceau', 'chunk'),
    ('pincee', 'pinch'), ('qs', 'to taste'), ('cm', 'cm')
  ) as v(code, abbr_en)
 where u.code = v.code and u.abbr_en is distinct from v.abbr_en;

-- Unité ajoutée plus tard sans abréviation anglaise : on reprend l'abréviation française.
update public.units set abbr_en = abbr where abbr_en is null;
alter table public.units alter column abbr_en set not null;
comment on column public.units.abbr_en is 'Abréviation affichée en anglais (abbr = français).';

-- ----------------------------------------------------------------------------
-- 2. recipes.lang et recherche plein texte selon la langue
-- ----------------------------------------------------------------------------
alter table public.recipes add column if not exists lang text not null default 'fr';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'recipes_lang_check' and conrelid = 'public.recipes'::regclass) then
    alter table public.recipes add constraint recipes_lang_check check (lang in ('fr', 'en'));
  end if;
end $$;
comment on column public.recipes.lang is 'Langue du texte saisi (fr | en). La traduction vers l''autre langue est dans recipe_translations.';

-- `search` dépend maintenant de `lang` : on recrée la colonne générée une seule fois.
do $$
declare v_def text;
begin
  select pg_get_expr(d.adbin, d.adrelid) into v_def
    from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
   where d.adrelid = 'public.recipes'::regclass and a.attname = 'search';
  if v_def is null or position('lang' in v_def) = 0 then
    drop index if exists public.idx_recipes_search;
    alter table public.recipes drop column if exists search;
    alter table public.recipes add column search tsvector generated always as (
      case when lang = 'en' then
        setweight(to_tsvector('english'::regconfig, public.immutable_unaccent(coalesce(title, ''))), 'A') ||
        setweight(to_tsvector('english'::regconfig, public.immutable_unaccent(coalesce(description, ''))), 'B') ||
        setweight(to_tsvector('english'::regconfig, public.immutable_unaccent(coalesce(public.immutable_array_to_string(tags), ''))), 'C')
      else
        setweight(to_tsvector('french'::regconfig, public.immutable_unaccent(coalesce(title, ''))), 'A') ||
        setweight(to_tsvector('french'::regconfig, public.immutable_unaccent(coalesce(description, ''))), 'B') ||
        setweight(to_tsvector('french'::regconfig, public.immutable_unaccent(coalesce(public.immutable_array_to_string(tags), ''))), 'C')
      end
    ) stored;
  end if;
end $$;
create index if not exists idx_recipes_search on public.recipes using gin (search);
comment on column public.recipes.search is 'Vecteur plein texte : titre A, description B, tags C ; stemming french (lang = fr) ou english (lang = en), sans accents. Colonne générée.';

-- ----------------------------------------------------------------------------
-- 3. Table recipe_translations
-- ----------------------------------------------------------------------------
create table if not exists public.recipe_translations (
  recipe_id     uuid        not null references public.recipes (id) on delete cascade,
  locale        text        not null check (locale in ('fr', 'en')),
  title         text        not null check (btrim(title) <> ''),
  description   text,
  notes         text,
  tags          text[]      not null default '{}',
  content       jsonb       not null default '{"sections": []}'::jsonb
                            check (jsonb_typeof(content) = 'object' and jsonb_typeof(content -> 'sections') = 'array'),
  source_hash   text        not null,
  model         text,
  stale         boolean     not null default false,
  translated_at timestamptz not null default now(),
  primary key (recipe_id, locale)
);

comment on table  public.recipe_translations is 'Traduction d''une recette vers `locale` (l''autre langue que recipes.lang). Textes par position, voir 0016.';
comment on column public.recipe_translations.content is '{ "sections": [ { "name", "ingredients": [ { "name", "amount", "unit" } ], "instructions": [ "…" ] } ] } — par POSITION dans les sections / ingrédients / étapes triés par order_index.';
comment on column public.recipe_translations.source_hash is 'Hash des textes sources au moment de la traduction (calculé par l''application).';
comment on column public.recipe_translations.stale is 'true : le texte source a changé depuis (ou la régénération a échoué) ; ignorée à l''affichage, retraduite par la page admin.';

-- Recherche : titre A, description B, noms d'ingrédients traduits C.
alter table public.recipe_translations add column if not exists search tsvector
  generated always as (
    case when locale = 'en' then
      setweight(to_tsvector('english'::regconfig, public.immutable_unaccent(coalesce(title, ''))), 'A') ||
      setweight(to_tsvector('english'::regconfig, public.immutable_unaccent(coalesce(description, ''))), 'B') ||
      setweight(to_tsvector('english'::regconfig, public.immutable_unaccent(coalesce(jsonb_path_query_array(content, '$.sections[*].ingredients[*].name')::text, ''))), 'C')
    else
      setweight(to_tsvector('french'::regconfig, public.immutable_unaccent(coalesce(title, ''))), 'A') ||
      setweight(to_tsvector('french'::regconfig, public.immutable_unaccent(coalesce(description, ''))), 'B') ||
      setweight(to_tsvector('french'::regconfig, public.immutable_unaccent(coalesce(jsonb_path_query_array(content, '$.sections[*].ingredients[*].name')::text, ''))), 'C')
    end
  ) stored;

create index if not exists idx_recipe_translations_search on public.recipe_translations using gin (search);
create index if not exists idx_recipe_translations_stale on public.recipe_translations (recipe_id) where stale;

alter table public.recipe_translations enable row level security;

drop policy if exists "recipe_translations_read_public" on public.recipe_translations;
create policy "recipe_translations_read_public" on public.recipe_translations for select using (true);
drop policy if exists "recipe_translations_admin_insert" on public.recipe_translations;
create policy "recipe_translations_admin_insert" on public.recipe_translations
  for insert with check (private.is_admin());
drop policy if exists "recipe_translations_admin_update" on public.recipe_translations;
create policy "recipe_translations_admin_update" on public.recipe_translations
  for update using (private.is_admin()) with check (private.is_admin());
drop policy if exists "recipe_translations_admin_delete" on public.recipe_translations;
create policy "recipe_translations_admin_delete" on public.recipe_translations
  for delete using (private.is_admin());

revoke all on public.recipe_translations from public, anon, authenticated;
grant select on public.recipe_translations to anon, authenticated, service_role;
grant insert, update, delete on public.recipe_translations to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. save_recipe_translation
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
  if not private.is_admin() then
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
  'Écrit la traduction d''une recette vers l''autre langue que p_lang (langue source, posée sur la recette). SECURITY INVOKER : admin seulement.';
revoke execute on function public.save_recipe_translation(uuid, text, jsonb) from public, anon;
grant  execute on function public.save_recipe_translation(uuid, text, jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. save_recipe (= 0013 + lang + traduction jointe + marquage périmé)
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
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'Payload invalide : un objet JSON est attendu' using errcode = '22023';
  end if;

  v_title    := nullif(btrim(payload->>'title'), '');
  v_category := nullif(btrim(payload->>'category'), '');
  if v_title is null then
    raise exception 'Le titre de la recette est obligatoire' using errcode = '22023';
  end if;
  if v_category is null then
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
      updated_at  = now()
    where id = v_id;
    if not found then
      raise exception 'Action réservée aux administrateurs' using errcode = '42501';
    end if;
  else
    insert into public.recipes (id, title, description, category,
                                prep_time, cook_time, servings, image, photo_path, tags, notes, lang)
    values (coalesce(v_id, gen_random_uuid()), v_title, payload->>'description', v_category,
            (payload->>'prep_time')::int, (payload->>'cook_time')::int, (payload->>'servings')::int,
            payload->>'image', nullif(btrim(payload->>'photo_path'), ''), v_tags, payload->>'notes',
            coalesce(v_lang, 'fr'))
    returning id into v_id;
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
  'Upsert complet d''une recette (recette + sections + ingrédients + instructions + photo_path + lang + traduction facultative). SECURITY INVOKER : réservé aux admins par RLS. 0016 : traductions marquées périmées si le texte est ré-enregistré sans traduction jointe.';

revoke execute on function public.save_recipe(jsonb) from public, anon;
grant  execute on function public.save_recipe(jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. search_recipes : texte d'origine + traduction, renvoie lang et translation
-- ----------------------------------------------------------------------------
drop function if exists public.search_recipes(text, text, text[], int, int);

create function public.search_recipes(
  p_query     text    default null,
  p_category  text    default null,
  p_tags      text[]  default null,
  p_limit     int     default 24,
  p_offset    int     default 0
)
returns table (
  id            uuid,
  title         text,
  description   text,
  category      text,
  prep_time     int,
  cook_time     int,
  servings      int,
  image         text,
  photo_path    text,
  notes         text,
  tags          text[],
  created_at    timestamptz,
  updated_at    timestamptz,
  total_count   bigint,
  lang          text,
  translation   jsonb
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with q as (
    select nullif(btrim(p_query), '') as raw,
           case when nullif(btrim(p_query), '') is null then null
                else websearch_to_tsquery('french'::regconfig, public.immutable_unaccent(btrim(p_query))) end as tsq_fr,
           case when nullif(btrim(p_query), '') is null then null
                else websearch_to_tsquery('english'::regconfig, public.immutable_unaccent(btrim(p_query))) end as tsq_en
  ),
  f as (
    select r.id, r.title, r.description, r.category, r.prep_time, r.cook_time, r.servings,
           r.image, r.photo_path, r.notes, r.tags, r.created_at, r.updated_at, r.lang,
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
      from public.recipes r
      cross join q
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
     where (p_category is null or r.category = p_category)
       and (p_tags is null or cardinality(p_tags) = 0 or r.tags @> p_tags)
       and (q.raw is null
            or (s.src_q is not null and numnode(s.src_q) > 0 and r.search @@ s.src_q)
            or (tr.locale is not null and s.tr_q is not null and numnode(s.tr_q) > 0 and tr.search @@ s.tr_q)
            or public.immutable_unaccent(r.title) ilike '%' || public.immutable_unaccent(q.raw) || '%'
            or (tr.locale is not null
                and public.immutable_unaccent(tr.title) ilike '%' || public.immutable_unaccent(q.raw) || '%'))
  )
  select f.id, f.title, f.description, f.category,
         f.prep_time, f.cook_time, f.servings, f.image, f.photo_path, f.notes, f.tags,
         f.created_at, f.updated_at,
         count(*) over () as total_count,
         f.lang, f.translation
    from f
   order by f.rank desc, f.created_at desc, f.id
   limit greatest(1, least(coalesce(p_limit, 24), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;

comment on function public.search_recipes(text, text, text[], int, int) is
  'Recherche plein texte (sans accents) dans le texte d''origine ET la traduction, filtres catégorie/tags, paginée, total_count. Renvoie lang et translation (jsonb, null si absente ou périmée). 0016.';

grant execute on function public.search_recipes(text, text, text[], int, int) to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 7. add_recipe_to_list : noms traduits selon la langue de l'interface
-- ----------------------------------------------------------------------------
drop function if exists public.add_recipe_to_list(uuid, uuid, uuid[], numeric);

create or replace function public.add_recipe_to_list(
  p_recipe_id        uuid,
  p_list_id          uuid,
  p_section_ids      uuid[]  default null,
  p_servings_factor  numeric default 1,
  p_locale           text    default null
)
returns setof public.shopping_items
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  r         record;
  v_lang    text;
  v_content jsonb;
  v_n_sec   int;
  v_name    text;
begin
  if p_servings_factor is null or p_servings_factor <= 0 then
    raise exception 'Le facteur de portions doit être strictement positif' using errcode = '22023';
  end if;
  select x.lang into v_lang from public.recipes x where x.id = p_recipe_id;
  if not found then
    raise exception 'Recette introuvable' using errcode = 'P0002';
  end if;
  if p_locale is not null and p_locale not in ('fr', 'en') then
    raise exception 'Langue invalide : % (fr ou en attendu)', p_locale using errcode = '22023';
  end if;

  -- Traduction utilisable : vers la langue demandée, non périmée, même nombre de sections.
  if p_locale is not null and p_locale <> v_lang then
    select t.content into v_content
      from public.recipe_translations t
     where t.recipe_id = p_recipe_id and t.locale = p_locale and not t.stale;
    select count(*) into v_n_sec from public.recipe_sections s where s.recipe_id = p_recipe_id;
    if v_content is not null and jsonb_array_length(v_content->'sections') <> v_n_sec then
      v_content := null;
    end if;
  end if;

  for r in
    with sec as (
      select s.id, (row_number() over (order by s.order_index, s.created_at, s.id) - 1)::int as pos
        from public.recipe_sections s where s.recipe_id = p_recipe_id
    ),
    ing as (
      select i.id, i.name, i.amount_num, i.unit_code, i.order_index, i.created_at, i.section_id,
             sec.pos as sec_pos,
             (row_number() over (partition by i.section_id order by i.order_index, i.created_at, i.id) - 1)::int as ing_pos
        from public.recipe_ingredients i
        left join sec on sec.id = i.section_id
       where i.recipe_id = p_recipe_id
    )
    select ing.name, ing.amount_num, ing.unit_code, ing.sec_pos, ing.ing_pos
      from ing
      left join public.recipe_sections s on s.id = ing.section_id
     where (p_section_ids is null or ing.section_id = any (p_section_ids))
     order by coalesce(s.order_index, 0), ing.order_index, ing.created_at
  loop
    v_name := r.name;
    if v_content is not null and r.sec_pos is not null then
      v_name := coalesce(nullif(btrim(v_content #>> array['sections', r.sec_pos::text, 'ingredients', r.ing_pos::text, 'name']), ''), r.name);
    end if;
    return next public.merge_shopping_item(
      p_list_id,
      v_name,
      case when r.amount_num is null then null else round(r.amount_num * p_servings_factor, 2) end,
      r.unit_code,
      p_recipe_id);
  end loop;
  return;
end;
$$;

comment on function public.add_recipe_to_list(uuid, uuid, uuid[], numeric, text) is
  'Ajoute les ingrédients d''une recette (toutes sections ou sections choisies) à une liste, quantités × facteur, avec fusion des homonymes. p_locale (fr | en) : noms traduits si la recette a une traduction valide vers cette langue (0016).';

revoke execute on function public.add_recipe_to_list(uuid, uuid, uuid[], numeric, text) from public, anon;
grant  execute on function public.add_recipe_to_list(uuid, uuid, uuid[], numeric, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 8. Vérifications finales
-- ----------------------------------------------------------------------------
do $$
declare b record; n bigint;
begin
  select * into b from tmp_0016_before;
  select count(*) into n from public.recipes;            assert n = b.n_recipes,      format('[0016] recettes : %s, attendu %s', n, b.n_recipes);
  select count(*) into n from public.recipe_sections;    assert n = b.n_sections,     format('[0016] sections : %s, attendu %s', n, b.n_sections);
  select count(*) into n from public.recipe_ingredients; assert n = b.n_ingredients,  format('[0016] ingrédients : %s, attendu %s', n, b.n_ingredients);
  select count(*) into n from public.instructions;       assert n = b.n_instructions, format('[0016] étapes : %s, attendu %s', n, b.n_instructions);

  assert (select relrowsecurity from pg_class where oid = 'public.recipe_translations'::regclass), '[0016] RLS non activée sur recipe_translations';
  assert (select count(*) from pg_policies where schemaname = 'public' and tablename = 'recipe_translations') = 4,
    '[0016] 4 politiques attendues sur recipe_translations';
  assert not has_table_privilege('anon', 'public.recipe_translations', 'insert'), '[0016] anon ne doit pas écrire les traductions';
  assert has_table_privilege('anon', 'public.recipe_translations', 'select'), '[0016] anon doit lire les traductions';
  assert (select count(*) from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
           where ns.nspname = 'public' and p.proname = 'save_recipe') = 1, '[0016] save_recipe : 1 surcharge attendue';
  assert (select count(*) from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
           where ns.nspname = 'public' and p.proname = 'search_recipes') = 1, '[0016] search_recipes : 1 surcharge attendue';
  assert (select count(*) from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
           where ns.nspname = 'public' and p.proname = 'add_recipe_to_list') = 1, '[0016] add_recipe_to_list : 1 surcharge attendue';
  assert position('photo_path' in pg_get_functiondef('public.save_recipe(jsonb)'::regprocedure)) > 0, '[0016] save_recipe doit écrire photo_path';
  assert position('save_recipe_translation' in pg_get_functiondef('public.save_recipe(jsonb)'::regprocedure)) > 0, '[0016] save_recipe doit appeler save_recipe_translation';
  assert has_function_privilege('authenticated', 'public.save_recipe(jsonb)', 'execute')
     and not has_function_privilege('anon', 'public.save_recipe(jsonb)', 'execute'), '[0016] droits save_recipe';
  assert not has_function_privilege('anon', 'public.save_recipe_translation(uuid, text, jsonb)', 'execute'), '[0016] droits save_recipe_translation';
  assert has_function_privilege('anon', 'public.search_recipes(text, text, text[], int, int)', 'execute'), '[0016] droits search_recipes';
  assert not exists (select 1 from public.units where abbr_en is null), '[0016] abbr_en manquante';
  assert not exists (select 1 from public.recipes where lang not in ('fr', 'en')), '[0016] lang invalide';
  raise notice '[0016] recettes bilingues : recipes.lang, recipe_translations, save_recipe, search_recipes, add_recipe_to_list, units.abbr_en en place';
end $$;

notify pgrst, 'reload schema';

commit;
