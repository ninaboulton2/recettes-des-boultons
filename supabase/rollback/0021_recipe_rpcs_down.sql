-- ============================================================================
--  Retour arrière de 0021 — fonctions métier côté recettes
-- ============================================================================
--  QUAND : pour revenir à l'état d'après 0019. Aucune donnée n'est touchée (0021 n'en écrit pas) ; les droits,
--  liens publics, entrées de carnet et bannières fermées créés par ces fonctions restent dans leurs tables.
--  CE QUE ÇA FAIT : supprime les 17 fonctions publiques et l'aide private.translation_card ; restaure
--  save_recipe et save_recipe_translation de 0016 (copie exacte, sans owner_id / category_id / visibility).
--  Si la bascule v2/0020 est appliquée, la restauration reste sûre : owner_id est rempli par son DEFAULT auth.uid().
--  Les clients v2 qui appellent les fonctions supprimées échouent (le code v2 doit être retiré avant).
--  Rejouable : tout est `if exists` / `create or replace`.
-- ============================================================================

begin;

drop function if exists public.dismiss_prompt(text, uuid);
drop function if exists public.pending_prompts(timestamptz, int);
drop function if exists public.recipe_usage(uuid);
drop function if exists public.get_shared_recipe(uuid, text);
drop function if exists public.claim_shared_recipe(uuid);
drop function if exists public.revoke_share_link(uuid);
drop function if exists public.create_share_link(uuid);
drop function if exists public.list_recipe_grants(uuid);
drop function if exists public.reshare_recipe(uuid, uuid, uuid, text);
drop function if exists public.revoke_recipe_grant(uuid);
drop function if exists public.grant_recipe(uuid, uuid, uuid, text);
drop function if exists public.list_shared_with_me(int, int);
drop function if exists public.list_author_recipes(uuid, int, int);
drop function if exists public.list_cookbook(uuid, text, int, int);
drop function if exists public.remove_from_cookbook(uuid);
drop function if exists public.add_to_cookbook(uuid, uuid);
drop function if exists public.copy_recipe(uuid);
drop function if exists private.translation_card(uuid);

-- ----------------------------------------------------------------------------
-- save_recipe_translation et save_recipe de 0016 (garde-fou « admin » seulement)
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

do $$
begin
  assert to_regprocedure('public.copy_recipe(uuid)') is null and to_regprocedure('public.get_shared_recipe(uuid, text)') is null
     and to_regprocedure('private.translation_card(uuid)') is null, '[0021 down] des fonctions de 0021 restent';
  assert position('category_id' in pg_get_functiondef('public.save_recipe(jsonb)'::regprocedure)) = 0
     and position('can_edit_recipe' in pg_get_functiondef('public.save_recipe_translation(uuid, text, jsonb)'::regprocedure)) = 0,
    '[0021 down] save_recipe / save_recipe_translation ne sont pas revenues à 0016';
  assert has_function_privilege('authenticated', 'public.save_recipe(jsonb)', 'execute')
     and not has_function_privilege('anon', 'public.save_recipe(jsonb)', 'execute'), '[0021 down] droits save_recipe';
  raise notice '[0021 down] fonctions de 0021 supprimées ; save_recipe et save_recipe_translation de 0016 restaurées';
end $$;

notify pgrst, 'reload schema';

commit;
