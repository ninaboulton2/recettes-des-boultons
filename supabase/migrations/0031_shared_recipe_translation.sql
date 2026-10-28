-- ============================================================================
--  0031 — Traduire une recette partagée pour la personne qui la lit (retour de test n° 1, point 3)
-- ============================================================================
--  CONSTAT
--   Une recette n'est traduite qu'à son enregistrement, par son auteur (`save_recipe_translation`, droit « peut modifier »). Une recette
--   sans traduction (IA coupée ou plafond atteint à l'enregistrement, traduction périmée, recette d'avant le bilingue) reste donc dans
--   sa langue d'origine pour une amie dont l'interface est dans l'autre langue, et PERSONNE d'autre que l'auteur ne peut la traduire.
--
--  QUOI (deux fonctions réservées au serveur, rôle service_role ; aucune table, colonne, politique ni donnée modifiée)
--   1. `save_recipe_translation_server(p_recipe_id, p_lang, p_translation)` : le corps de `save_recipe_translation` (0021) SANS le
--      contrôle « admin ou peut modifier ». Elle est appelée par la route serveur qui traduit à la demande une recette que la
--      personne a le droit de LIRE (vérifié par la route avec la session de la personne, ou par un lien public actif). Mêmes
--      validations, même écriture (une ligne par recette, vers l'autre langue que la langue source, `stale = false`).
--   2. `shared_recipe_id(p_token)` : l'identifiant de la recette derrière un lien public ACTIF (la page publique ne le connaît pas :
--      `get_shared_recipe` n'en renvoie aucun). Comme `shared_recipe_photo_path` (0029) : jamais exposée à l'API publique.
--   Le coût de l'appel IA est compté sur l'AUTEUR de la recette (comme à l'enregistrement), jamais sur la personne qui lit : voir
--   server/utils/sharedTranslation.ts.
--
--  SANS EFFET SUR LA V1
--   Deux fonctions nouvelles que personne n'appelle tant que le code v2 n'est pas déployé. Compatible avec le SQL Editor de Supabase
--   (aucune table temporaire). Idempotente, rejouable.
--  Retour arrière : supabase/rollback/0031_shared_recipe_translation_down.sql.
--  Prérequis : 0016 (recipe_translations), 0017 (recipe_share_links).
-- ============================================================================
begin;

do $$
begin
  assert to_regclass('public.recipe_translations') is not null, '[0031] recipe_translations absente : appliquer 0016 d''abord';
  assert to_regclass('public.recipe_share_links') is not null, '[0031] recipe_share_links absente : appliquer 0017 d''abord';
end $$;

create or replace function public.save_recipe_translation_server(
  p_recipe_id    uuid,
  p_lang         text,
  p_translation  jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_locale  text;
  v_title   text;
  v_hash    text;
  v_content jsonb;
  v_tags    text[];
begin
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

  -- Comme save_recipe_translation : la langue source peut être corrigée (détection IA), et une traduction vers cette langue est retirée.
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
end;
$$;
comment on function public.save_recipe_translation_server(uuid, text, jsonb) is
  'Écrit la traduction d''une recette vers l''autre langue que p_lang, SANS contrôle de droit : réservée à service_role (route serveur qui a vérifié que la personne peut LIRE la recette, ou un lien public actif). Même corps que save_recipe_translation. 0031.';

revoke execute on function public.save_recipe_translation_server(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.save_recipe_translation_server(uuid, text, jsonb) to service_role;

create or replace function public.shared_recipe_id(p_token uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select l.recipe_id from public.recipe_share_links l where l.token = p_token
$$;
comment on function public.shared_recipe_id(uuid) is
  'Identifiant de la recette derrière un lien public actif (NULL si le jeton est inconnu ou révoqué). Réservée à service_role : la page publique ne doit jamais connaître cet identifiant. 0031.';

revoke execute on function public.shared_recipe_id(uuid) from public, anon, authenticated;
grant execute on function public.shared_recipe_id(uuid) to service_role;

do $$
begin
  assert has_function_privilege('service_role', 'public.save_recipe_translation_server(uuid, text, jsonb)', 'execute'), '[0031] service_role doit pouvoir exécuter save_recipe_translation_server';
  assert not has_function_privilege('authenticated', 'public.save_recipe_translation_server(uuid, text, jsonb)', 'execute'), '[0031] authenticated ne doit pas pouvoir exécuter save_recipe_translation_server';
  assert not has_function_privilege('anon', 'public.save_recipe_translation_server(uuid, text, jsonb)', 'execute'), '[0031] anon ne doit pas pouvoir exécuter save_recipe_translation_server';
  assert has_function_privilege('service_role', 'public.shared_recipe_id(uuid)', 'execute'), '[0031] service_role doit pouvoir exécuter shared_recipe_id';
  assert not has_function_privilege('authenticated', 'public.shared_recipe_id(uuid)', 'execute'), '[0031] authenticated ne doit pas pouvoir exécuter shared_recipe_id';
  assert not has_function_privilege('anon', 'public.shared_recipe_id(uuid)', 'execute'), '[0031] anon ne doit pas pouvoir exécuter shared_recipe_id';
end $$;

notify pgrst, 'reload schema';
commit;
