-- ============================================================================
--  0011 — save_recipe : prise en compte de photo_path
-- ============================================================================
--  QUOI
--   - `public.save_recipe(payload jsonb)` recréée (create or replace) : corps
--     IDENTIQUE à 0006, plus l'écriture de `recipes.photo_path` (colonne
--     ajoutée par 0010) depuis `payload->>'photo_path'` :
--        * mise à jour : `photo_path = nullif(btrim(payload->>'photo_path'), '')`
--          → l'éditeur renvoie toujours la recette complète ; une valeur
--          absente ou vide RETIRE la photo (cohérent avec le remplacement
--          complet des sections) ;
--        * création : même expression dans l'insert.
--   - Rien d'autre ne change : signature, droits (execute pour
--     `authenticated` uniquement), SECURITY INVOKER (RLS admin), recalcul du
--     JSONB legacy, messages d'erreur. `delete_recipe` n'est pas touchée.
--
--  POURQUOI
--   L'éditeur (phase 3B) téléverse la photo dans le bucket `recipe-photos`
--   depuis le navigateur (client Supabase, RLS admin de 0010) puis envoie le
--   chemin dans `RecipeInput.photoPath` ; `toSaveRecipePayload` le transmet
--   en `photo_path`. Sans cette migration, `save_recipe` ignore la clé et la
--   photo n'est jamais associée à la recette.
--
--  PAYLOAD : voir 0006 ; nouvelle clé optionnelle `photo_path?: text`
--   (ex. « <recipe_id>/1696350000000.webp »). La suppression de l'objet dans
--   le bucket reste à la charge du client (pas de trigger storage).
--
--  RÉVERSIBILITÉ : rejouer `supabase/migrations/0006_save_recipe.sql`
--  (recrée la version sans photo_path). Aucune donnée touchée à l'application ;
--  la colonne `recipes.photo_path` (0010) est conservée.
--
--  VÉRIFICATION (admin connecté) :
--   select save_recipe('{"title":"__test__","category":"plats","photo_path":"x/y.webp"}');
--   select photo_path from recipes where title = '__test__';  -- x/y.webp
--   puis delete_recipe(id).
-- ============================================================================

begin;

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
  v_json_ing    jsonb;
  v_json_ins    jsonb;
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
      updated_at  = now()
    where id = v_id;
    if not found then
      raise exception 'Action réservée aux administrateurs' using errcode = '42501';
    end if;
  else
    insert into public.recipes (id, title, description, category, ingredients, instructions,
                                prep_time, cook_time, servings, image, photo_path, tags, notes)
    values (coalesce(v_id, gen_random_uuid()), v_title, payload->>'description', v_category,
            '[]'::jsonb, '[]'::jsonb,
            (payload->>'prep_time')::int, (payload->>'cook_time')::int, (payload->>'servings')::int,
            payload->>'image', nullif(btrim(payload->>'photo_path'), ''), v_tags, payload->>'notes')
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

  -- 3. JSONB legacy recalculé depuis les sections ------------------------------
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'name',   ri.name,
             'unit',   coalesce(ri.unit, ''),
             'amount', case when ri.amount_num is not null then to_jsonb(trim_scale(ri.amount_num))
                            when ri.amount is not null     then to_jsonb(ri.amount)
                            else 'null'::jsonb end)
           || case when coalesce(ri.optional, false) then '{"optional": true}'::jsonb else '{}'::jsonb end
           order by rs.order_index, ri.order_index, ri.created_at), '[]'::jsonb)
    into v_json_ing
    from public.recipe_ingredients ri
    join public.recipe_sections rs on rs.id = ri.section_id
   where ri.recipe_id = v_id;

  select coalesce(jsonb_agg(to_jsonb(ins.content) order by rs.order_index, ins.order_index, ins.created_at), '[]'::jsonb)
    into v_json_ins
    from public.instructions ins
    join public.recipe_sections rs on rs.id = ins.section_id
   where ins.recipe_id = v_id;

  update public.recipes set ingredients = v_json_ing, instructions = v_json_ins where id = v_id;

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
  'Upsert complet d''une recette (recette + sections + ingrédients + instructions + photo_path) et recalcul du JSONB legacy. SECURITY INVOKER : réservé aux admins par RLS.';

revoke execute on function public.save_recipe(jsonb) from public, anon;
grant  execute on function public.save_recipe(jsonb) to authenticated;

do $$
begin
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'save_recipe') = 1, '[0011] save_recipe attendue (1 surcharge)';
  assert position('photo_path' in pg_get_functiondef('public.save_recipe(jsonb)'::regprocedure)) > 0,
    '[0011] save_recipe doit écrire photo_path';
end $$;

commit;
