-- Empreinte des données « v1 » (colonnes existant avant la v2) : une ligne par table, nombre de lignes + md5.
-- Sert à prouver que le retour arrière de la bascule v2 rend les données identiques à l'avant
-- (supabase/BASCULE_V2.md § 3, supabase/REPETITION_V2.md). Lecture seule, rejouable, local ou SQL Editor.
--   psql "$DB" -X -At -f supabase/local/rehearsal_fingerprint.sql > avant.txt   (puis > apres.txt ; diff avant.txt apres.txt)
select t || '|' || n || '|' || h from (
  select 'recipes' t, count(*) n, md5(coalesce(string_agg(to_jsonb(x)::text, E'\n' order by id), '')) h
    from (select id,title,description,category,prep_time,cook_time,servings,image,tags,notes,created_at,updated_at,photo_path,lang from public.recipes) x
  union all select 'recipe_sections', count(*), md5(coalesce(string_agg(to_jsonb(x)::text, E'\n' order by id), '')) from (select id,recipe_id,name,type,order_index,created_at,updated_at from public.recipe_sections) x
  union all select 'recipe_ingredients', count(*), md5(coalesce(string_agg(to_jsonb(x)::text, E'\n' order by id), '')) from (select id,recipe_id,section_id,name,amount,unit,optional,order_index,created_at,updated_at,unit_code,amount_num from public.recipe_ingredients) x
  union all select 'instructions', count(*), md5(coalesce(string_agg(to_jsonb(x)::text, E'\n' order by id), '')) from (select id,recipe_id,section_id,content,order_index,created_at,updated_at from public.instructions) x
  union all select 'recipe_translations', count(*), md5(coalesce(string_agg(to_jsonb(x)::text, E'\n' order by recipe_id, locale), '')) from (select recipe_id,locale,title,description,notes,tags,content,source_hash,stale,translated_at from public.recipe_translations) x
  union all select 'favorites', count(*), md5(coalesce(string_agg(to_jsonb(x)::text, E'\n' order by id), '')) from (select id,user_id,recipe_id,created_at from public.favorites) x
  union all select 'planning', count(*), md5(coalesce(string_agg(to_jsonb(x)::text, E'\n' order by id), '')) from (select id,user_id,date_string,meal_type,recipe_id,custom_title,created_at from public.planning) x
  union all select 'planning_notes', count(*), md5(coalesce(string_agg(to_jsonb(x)::text, E'\n' order by id), '')) from (select id,user_id,date_string,note_type,content,created_at from public.planning_notes) x
  union all select 'shopping_lists', count(*), md5(coalesce(string_agg(to_jsonb(x)::text, E'\n' order by id), '')) from (select id,user_id,name,created_at from public.shopping_lists) x
  union all select 'shopping_items', count(*), md5(coalesce(string_agg(to_jsonb(x)::text, E'\n' order by id), '')) from (select id,list_id,name,amount,unit,recipe_id,is_checked,created_at,unit_code,amount_num from public.shopping_items) x
  union all select 'profiles(v1)', count(*), md5(coalesce(string_agg(to_jsonb(x)::text, E'\n' order by id), '')) from (select id,email,name,role,language,theme,notifications,created_at from public.profiles) x
  union all select 'auth.users', count(*), md5(coalesce(string_agg(id::text || coalesce(email,''), E'\n' order by id), '')) from auth.users
) f order by t;
