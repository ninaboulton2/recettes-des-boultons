-- Retour arrière de 0032 : retire les rayons choisis (colonne, préférences, fonction) et rétablit reserve_ai_call / ai_quota_status de 0028
-- (la traduction à la demande recompte alors dans le plafond du jour ; les lignes ai_usage `translate_shared` restent). Rejouable.
begin;
drop function if exists public.set_shopping_item_aisle(uuid, text, text);
drop table if exists public.shopping_aisle_prefs;
alter table public.shopping_items drop constraint if exists shopping_items_aisle_check;
alter table public.shopping_items drop column if exists aisle;

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
  select count(*)::integer into v_used from public.ai_usage u where u.user_id = v_me and u.created_at >= v_start;
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
begin
  select p.ai_daily_quota, p.created_at into v_override, v_created from public.profiles p where p.id = p_user;
  if not found then
    raise exception 'Compte inconnu' using errcode = '22023';
  end if;
  -- Verrous : un par compte (plafond du jour), puis un global si un budget du mois est réglé. Toujours dans cet ordre (pas d'interblocage).
  -- Relâchés à la fin de la transaction, c'est-à-dire juste après l'insertion de la réservation : la suivante la voit.
  perform pg_advisory_xact_lock(hashtextextended(p_user::text || ':ai_call', 0));
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
  select count(*)::integer into v_used from public.ai_usage u where u.user_id = p_user and u.created_at >= v_day;
  if v_used >= v_quota then
    return jsonb_build_object('ok', false, 'reason', 'quota', 'used', v_used, 'quota', v_quota, 'resets_at', v_reset, 'is_new', v_is_new);
  end if;

  insert into public.ai_usage (user_id, provider, model, feature, status)
    values (p_user, 'pending', 'pending', coalesce(nullif(btrim(p_feature), ''), 'translate'), 'pending')
    returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'used', v_used + 1, 'quota', v_quota, 'resets_at', v_reset, 'is_new', v_is_new);
end $$;

do $$
begin
  assert to_regclass('public.shopping_aisle_prefs') is null, '[0032 down] shopping_aisle_prefs restante';
  raise notice '[0032 down] OK';
end $$;
notify pgrst, 'reload schema';
commit;
