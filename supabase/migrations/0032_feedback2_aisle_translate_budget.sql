-- ============================================================================
--  0032 — Retour de test n° 2 : rayon choisi par la personne (courses) et traduction à la demande hors quota
-- ============================================================================
--  QUOI
--   A. Courses, « Par rayon » : `shopping_items.aisle` (texte, NULL = déduit du nom par mots-clés côté interface), restreint aux
--      rayons de `AISLES` (shared/utils/shopping.ts) ; table `public.shopping_aisle_prefs` (une ligne par personne et par nom
--      replié `foldName`, RLS « propriétaire seulement ») : le rayon choisi est retenu pour les futures listes.
--      `set_shopping_item_aisle(p_item, p_aisle, p_name_key)` (SECURITY INVOKER, authenticated) : pose le rayon sur l'article
--      (NULL = automatique) et met à jour la préférence (supprimée si NULL). Priorité côté interface : article > préférence > mots-clés.
--   B. Traduction à la demande d'une recette partagée (DEVELOPER.md § 20.19) : Nina a choisi qu'elle ne compte QUE sur le budget global
--      du mois, jamais sur le plafond du jour de quelqu'un. La feature `translate_shared` (ligne `ai_usage` conservée, donc comptée dans
--      le budget du mois et le coût) est ignorée par `ai_quota_status` et par `reserve_ai_call` (ni plafond, ni verrou par compte ;
--      crédit épuisé et budget du mois restent contrôlés).
--
--  SANS EFFET SUR LA V1 : colonne nullable, table nouvelle, fonctions remplacées sans changement pour les autres features.
--  Compatible avec le SQL Editor de Supabase (aucune table temporaire). Idempotente, rejouable.
--  Retour arrière : supabase/rollback/0032_feedback2_aisle_translate_budget_down.sql.
--  Prérequis : 0001 (shopping_items), 0028 (reserve_ai_call, ai_quota_status).
-- ============================================================================
begin;

do $$
begin
  assert to_regclass('public.shopping_items') is not null, '[0032] shopping_items absente';
  assert to_regprocedure('public.reserve_ai_call(uuid, text, integer, integer, integer, integer, numeric)') is not null, '[0032] 0028 absente : appliquer 0028 d''abord';
end $$;

-- A. Rayons ------------------------------------------------------------------------------------------------------------------
alter table public.shopping_items add column if not exists aisle text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'shopping_items_aisle_check' and conrelid = 'public.shopping_items'::regclass) then
    alter table public.shopping_items add constraint shopping_items_aisle_check check (aisle is null or aisle in ('produce', 'bakery', 'meatFish', 'dairy', 'grocery', 'frozen', 'beverages', 'household', 'other'));
  end if;
end $$;
comment on column public.shopping_items.aisle is 'Rayon choisi par la personne (NULL = déduit du nom). Valeurs : AISLES de shared/utils/shopping.ts.';

create table if not exists public.shopping_aisle_prefs (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  name_key   text        not null check (char_length(btrim(name_key)) between 1 and 200),
  aisle      text        not null check (aisle in ('produce', 'bakery', 'meatFish', 'dairy', 'grocery', 'frozen', 'beverages', 'household', 'other')),
  updated_at timestamptz not null default now(),
  primary key (user_id, name_key)
);
comment on table public.shopping_aisle_prefs is 'Rayon préféré par personne pour un article (nom replié par foldName) : appliqué à ses futures listes.';
alter table public.shopping_aisle_prefs enable row level security;
drop policy if exists "aisle_prefs_owner_select" on public.shopping_aisle_prefs;
drop policy if exists "aisle_prefs_owner_insert" on public.shopping_aisle_prefs;
drop policy if exists "aisle_prefs_owner_update" on public.shopping_aisle_prefs;
drop policy if exists "aisle_prefs_owner_delete" on public.shopping_aisle_prefs;
create policy "aisle_prefs_owner_select" on public.shopping_aisle_prefs for select using ((select auth.uid()) = user_id);
create policy "aisle_prefs_owner_insert" on public.shopping_aisle_prefs for insert with check ((select auth.uid()) = user_id);
create policy "aisle_prefs_owner_update" on public.shopping_aisle_prefs for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "aisle_prefs_owner_delete" on public.shopping_aisle_prefs for delete using ((select auth.uid()) = user_id);
revoke all on public.shopping_aisle_prefs from public, anon;
grant select, insert, update, delete on public.shopping_aisle_prefs to authenticated;

create or replace function public.set_shopping_item_aisle(p_item uuid, p_aisle text, p_name_key text)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_me  uuid := (select auth.uid());
  v_key text := nullif(btrim(p_name_key), '');
begin
  if v_me is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  if p_aisle is not null and p_aisle not in ('produce', 'bakery', 'meatFish', 'dairy', 'grocery', 'frozen', 'beverages', 'household', 'other') then
    raise exception 'Rayon inconnu : %', p_aisle using errcode = '22023';
  end if;
  if v_key is not null and char_length(v_key) > 200 then
    raise exception 'Nom trop long' using errcode = '22023';
  end if;
  -- sous RLS : un article d'une autre personne est invisible
  update public.shopping_items set aisle = p_aisle where id = p_item;
  if not found then
    raise exception 'Article introuvable ou non autorisé' using errcode = '42501';
  end if;
  if v_key is not null then
    if p_aisle is null then
      delete from public.shopping_aisle_prefs where user_id = v_me and name_key = v_key;
    else
      insert into public.shopping_aisle_prefs (user_id, name_key, aisle) values (v_me, v_key, p_aisle)
        on conflict (user_id, name_key) do update set aisle = excluded.aisle, updated_at = now();
    end if;
  end if;
end $$;
comment on function public.set_shopping_item_aisle(uuid, text, text) is
  'Pose le rayon d''un article (NULL = automatique) et retient le choix pour le nom replié donné. SECURITY INVOKER : RLS propriétaire.';
revoke execute on function public.set_shopping_item_aisle(uuid, text, text) from public, anon;
grant execute on function public.set_shopping_item_aisle(uuid, text, text) to authenticated;

-- B. Traduction à la demande : hors plafond du jour, dans le budget du mois -----------------------------------------------------
create or replace function public.ai_quota_status(p_default_quota integer, p_new_quota integer, p_new_days integer)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_me       uuid := (select auth.uid());
  v_override integer;
  v_created  timestamptz;
  v_is_new   boolean;
  v_quota    integer;
  v_used     integer;
  v_start    timestamptz := (date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris');
  -- minuit suivant, calculé sur l'heure LOCALE de Paris (ajouter 24 h à un timestamptz se trompe d'une heure le jour du changement d'heure)
  v_reset    timestamptz := ((date_trunc('day', now() at time zone 'Europe/Paris') + interval '1 day') at time zone 'Europe/Paris');
begin
  select p.ai_daily_quota, p.created_at into v_override, v_created from public.profiles p where p.id = v_me;
  v_is_new := v_created is not null and v_created > now() - make_interval(days => greatest(coalesce(p_new_days, 0), 0));
  v_quota  := coalesce(v_override, case when v_is_new then p_new_quota else p_default_quota end, 0);
  select count(*)::integer into v_used from public.ai_usage u where u.user_id = v_me and u.created_at >= v_start and u.feature <> 'translate_shared';   -- 0032 : la traduction à la demande ne compte pas dans le plafond
  return jsonb_build_object(
    'used', v_used,
    'quota', v_quota,
    'resets_at', v_reset,
    'is_new', v_is_new,
    'has_override', v_override is not null
  );
end $$;
create or replace function public.reserve_ai_call(
  p_user uuid, p_feature text,
  p_default_quota integer, p_new_quota integer, p_new_days integer,
  p_budget_calls integer default 0, p_budget_usd numeric default 0)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_override integer;
  v_created  timestamptz;
  v_is_new   boolean;
  v_quota    integer;
  v_used     integer;
  v_alert    record;
  v_calls    bigint;
  v_cost     numeric;
  v_day      timestamptz := (date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris');
  v_reset    timestamptz := ((date_trunc('day', now() at time zone 'Europe/Paris') + interval '1 day') at time zone 'Europe/Paris');
  v_month    timestamptz := (date_trunc('month', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris');
  v_id       uuid;
  v_exempt   boolean;
begin
  select p.ai_daily_quota, p.created_at into v_override, v_created from public.profiles p where p.id = p_user;
  if not found then
    raise exception 'Compte inconnu' using errcode = '22023';
  end if;
  -- Verrous : un par compte (plafond du jour), puis un global si un budget du mois est réglé. Toujours dans cet ordre (pas d'interblocage).
  -- Relâchés à la fin de la transaction, c'est-à-dire juste après l'insertion de la réservation : la suivante la voit.
  -- 0032 : une traduction à la demande (feature « translate_shared ») ne passe PAS par le plafond du jour : pas de verrou par compte non plus
  v_exempt := coalesce(p_feature, '') = 'translate_shared';
  if not v_exempt then
    perform pg_advisory_xact_lock(hashtextextended(p_user::text || ':ai_call', 0));
  end if;
  if coalesce(p_budget_calls, 0) > 0 or coalesce(p_budget_usd, 0) > 0 then
    perform pg_advisory_xact_lock(hashtextextended('ai_call:budget', 0));
  end if;
  -- les seuils que le serveur applique sont exposés (sous forme de booléen seulement) par ai_service_status()
  -- (écrit seulement si un seuil change : un UPSERT à chaque appel verrouillerait la ligne et sérialiserait tout le monde)
  if (select s.value from private.app_settings s where s.key = 'ai_budget_calls') is distinct from coalesce(p_budget_calls, 0)::text
     or (select s.value from private.app_settings s where s.key = 'ai_budget_usd') is distinct from coalesce(p_budget_usd, 0)::text then
    insert into private.app_settings as s (key, value) values ('ai_budget_calls', coalesce(p_budget_calls, 0)::text), ('ai_budget_usd', coalesce(p_budget_usd, 0)::text)
      on conflict (key) do update set value = excluded.value, updated_at = now();
  end if;

  select a.status, a.first_seen into v_alert from public.system_alerts a where a.key = 'ai_credit';
  if coalesce(v_alert.status, 'ok') = 'alert' then
    return jsonb_build_object('ok', false, 'reason', 'credit', 'since', v_alert.first_seen);
  end if;

  if coalesce(p_budget_calls, 0) > 0 or coalesce(p_budget_usd, 0) > 0 then
    select count(*), coalesce(sum(u.estimated_cost_usd), 0) into v_calls, v_cost from public.ai_usage u where u.created_at >= v_month;
    if (coalesce(p_budget_calls, 0) > 0 and v_calls >= p_budget_calls) or (coalesce(p_budget_usd, 0) > 0 and v_cost >= p_budget_usd) then
      return jsonb_build_object('ok', false, 'reason', 'budget');
    end if;
  end if;

  v_is_new := v_created is not null and v_created > now() - make_interval(days => greatest(coalesce(p_new_days, 0), 0));
  v_quota  := coalesce(v_override, case when v_is_new then p_new_quota else p_default_quota end, 0);
  select count(*)::integer into v_used from public.ai_usage u where u.user_id = p_user and u.created_at >= v_day and u.feature <> 'translate_shared';
  if not v_exempt and v_used >= v_quota then
    return jsonb_build_object('ok', false, 'reason', 'quota', 'used', v_used, 'quota', v_quota, 'resets_at', v_reset, 'is_new', v_is_new);
  end if;

  insert into public.ai_usage (user_id, provider, model, feature, status)
    values (p_user, 'pending', 'pending', coalesce(nullif(btrim(p_feature), ''), 'translate'), 'pending')
    returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'used', v_used + 1, 'quota', v_quota, 'resets_at', v_reset, 'is_new', v_is_new);
end $$;

notify pgrst, 'reload schema';

do $$
begin
  assert exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'shopping_items' and column_name = 'aisle'), '[0032] shopping_items.aisle absente';
  assert to_regclass('public.shopping_aisle_prefs') is not null, '[0032] shopping_aisle_prefs absente';
  assert to_regprocedure('public.set_shopping_item_aisle(uuid, text, text)') is not null, '[0032] set_shopping_item_aisle absente';
  raise notice '[0032] OK';
end $$;

commit;
