-- ============================================================================
--  0028 — IA ouverte à tous : quota par compte, état du crédit IA, budget mensuel, e-mails de notification (phase 7)
-- ============================================================================
--  QUOI
--   A. `profiles.ai_daily_quota` (entier, NULL par défaut) : plafond d'appels IA par jour pour CE compte (le support peut
--      l'augmenter ou le baisser). NULL = règle générale (voir B). Non modifiable par l'API (droits de colonnes de 0019).
--   B. `public.ai_quota_status(p_default_quota, p_new_quota, p_new_days)` (SECURITY INVOKER, jsonb) : pour la personne connectée,
--      appels du jour (Europe/Paris, comme `check_ai_quota`), plafond applicable, et heure de remise à zéro. Plafond =
--      la colonne A si elle est renseignée ; sinon `p_new_quota` si le compte a moins de `p_new_days` jours ; sinon
--      `p_default_quota`. Les valeurs par défaut viennent de l'environnement du serveur (AI_DAILY_QUOTA, AI_NEW_ACCOUNT_*).
--   C. `public.ai_service_status()` (SECURITY DEFINER, authenticated, SANS argument) : « le crédit IA est-il épuisé ? » (ligne
--      `system_alerts` clé `ai_credit`) et « le budget du mois est-il atteint ? ». Les seuils du budget ne viennent PLUS de
--      l'appelant (relecture n° 3 : en les faisant varier, tout compte pouvait déduire les totaux du mois) : ils sont lus dans
--      `private.app_settings` (clés `ai_budget_calls`, `ai_budget_usd`), tenue à jour par le serveur à chaque réservation (voir F).
--      Un compte ordinaire ne reçoit que des booléens ; les totaux du mois ne sont rendus qu'au support.
--   F. Réservation atomique d'un appel IA (relecture n° 3 : plusieurs requêtes en parallèle passaient toutes le contrôle du plafond
--      AVANT que la première n'écrive sa ligne `ai_usage`) :
--        `reserve_ai_call(p_user, p_feature, quotas, budgets)` (service_role) : sous un verrou consultatif PAR COMPTE (et un verrou
--                                      global si un budget est réglé), vérifie crédit, budget du mois, plafond du jour, puis insère
--                                      la ligne `ai_usage` en statut `pending` (elle compte aussitôt) et renvoie son identifiant ;
--        `finish_ai_call(p_id, …)`     (service_role) : passe la ligne à `ok` / `error` avec fournisseur, modèle, tokens, coût, durée ;
--      `ai_usage.status` accepte donc aussi `pending` (contrainte élargie ; sans effet pour la v1, qui n'écrit que ok / error).
--      Une réservation jamais terminée (processus tué) reste `pending` et compte : prudent, le fournisseur a pu être facturé.
--   D. Alertes (table `system_alerts`, 0017), fonctions réservées au rôle service_role (le serveur) :
--        `report_ai_billing_error()`   passe `ai_credit` à « alert » et répond TRUE si un e-mail doit partir
--                                      (au plus UN par 24 h, opération atomique : pas de doublon même en parallèle) ;
--        `claim_ai_alert_email(key)`   même limitation pour une autre alerte (`ai_budget`) sans changer d'état ;
--        `reset_ai_credit_alert()`     repasse `ai_credit` à « ok » (cron de rattrapage) ;
--        `ai_credit_alert_active()`     l'alerte est-elle active ? (le cron n'appelle le fournisseur que si oui) ;
--      et pour le support (connecté, `private.is_support()`) : `support_reset_ai_credit()` (bouton « Réactiver l'IA »).
--   E. `notifications.emailed_at` (envoyé) et `notifications.claimed_at` (bail) + trois fonctions service_role pour l'envoi groupé :
--        `claim_notification_emails(limit, max_age, lease)` réclame pour `lease` (10 min) et renvoie (destinataire, langue, e-mail
--                                      du COMPTE, type, données) les demandes d'ami et invitations de groupe NON LUES, récentes, non
--                                      envoyées, sans bail en cours, dont la personne a `profiles.notifications` vrai ;
--        `confirm_notification_emails(ids)` marque envoyées (`emailed_at`) ;
--        `release_notification_emails(ids)` lève le bail si l'envoi n'a pas eu lieu (réessai au prochain passage). Si le processus
--                                      meurt avant, le bail expire seul : plus aucune notification n'est perdue.
--
--  POURQUOI
--   Dossier §6.3–6.5 : l'IA devient ouverte à tous les comptes (v2). Il faut un plafond par compte, un état « crédit épuisé »
--   visible de tous, une alerte à Nina au plus une fois par jour, un budget mensuel, et les e-mails de notification (Resend).
--
--  SANS EFFET SUR LA V1
--   Colonnes nullables, une table `private` nouvelle, des fonctions nouvelles, une contrainte de `ai_usage.status` ÉLARGIE (+ pending).
--   Aucune politique, aucun déclencheur, aucune donnée existante modifiée ; `check_ai_quota` (0012) reste celle de la v1 (la v1, réservée à quatre administrateurs, garde le contrôle puis l'écriture en deux temps :
--   la course n'y est pas exploitable ; la réservation atomique est v2 seulement). Compatible avec le SQL Editor de Supabase (aucune table
--   temporaire). Idempotente, rejouable.
--
--  Retour arrière : supabase/rollback/0028_ai_credit_email_down.sql.
--  Prérequis : 0012 (ai_usage), 0017 (system_alerts, notifications), 0019 (private.is_support, droits de colonnes de profiles).
-- ============================================================================
begin;

do $$
begin
  assert to_regclass('public.ai_usage') is not null, '[0028] 0012 absente : appliquer 0012 d''abord';
  assert to_regclass('public.system_alerts') is not null and to_regclass('public.notifications') is not null, '[0028] 0017 absente : appliquer 0017 d''abord';
  assert to_regprocedure('private.is_support()') is not null, '[0028] 0019 absente : appliquer 0019 d''abord';
end $$;

-- A. Plafond personnel (NULL = règle générale) -------------------------------------------------------------------------------
alter table public.profiles add column if not exists ai_daily_quota integer;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_ai_daily_quota_check' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_ai_daily_quota_check check (ai_daily_quota is null or ai_daily_quota >= 0);
  end if;
end $$;
comment on column public.profiles.ai_daily_quota is 'Appels IA max par jour pour ce compte (NULL = règle générale du serveur : AI_DAILY_QUOTA / AI_NEW_ACCOUNT_DAILY_QUOTA). Modifiable par le support seulement.';

-- B. Quota du jour de la personne connectée -----------------------------------------------------------------------------------
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
begin
  select p.ai_daily_quota, p.created_at into v_override, v_created from public.profiles p where p.id = v_me;
  v_is_new := v_created is not null and v_created > now() - make_interval(days => greatest(coalesce(p_new_days, 0), 0));
  v_quota  := coalesce(v_override, case when v_is_new then p_new_quota else p_default_quota end, 0);
  select count(*)::integer into v_used from public.ai_usage u where u.user_id = v_me and u.created_at >= v_start;
  return jsonb_build_object(
    'used', v_used,
    'quota', v_quota,
    'resets_at', (v_start + interval '1 day'),
    'is_new', v_is_new,
    'has_override', v_override is not null
  );
end $$;
comment on function public.ai_quota_status(integer, integer, integer) is
  'Appels IA du jour, plafond applicable et remise à zéro (minuit Europe/Paris) pour la personne connectée. SECURITY INVOKER : compte sous RLS.';
revoke execute on function public.ai_quota_status(integer, integer, integer) from public, anon;
grant execute on function public.ai_quota_status(integer, integer, integer) to authenticated, service_role;

-- C. État du service IA (crédit épuisé, budget du mois) ---------------------------------------------------------------------
-- Réglages serveur : jamais lisibles ni modifiables par l'API.
create table if not exists private.app_settings (
  key        text        primary key,
  value      text        not null,
  updated_at timestamptz not null default now()
);
comment on table private.app_settings is 'Réglages posés par le serveur (0028) : ai_budget_calls, ai_budget_usd (copie de AI_MONTHLY_BUDGET_*). Aucun accès par l''API.';
alter table private.app_settings enable row level security;
revoke all on private.app_settings from public, anon, authenticated;

drop function if exists public.ai_service_status(integer, numeric);
create or replace function public.ai_service_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_alert    record;
  v_support  boolean;
  v_start    timestamptz := (date_trunc('month', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris');
  v_b_calls  numeric := coalesce((select s.value::numeric from private.app_settings s where s.key = 'ai_budget_calls'), 0);
  v_b_usd    numeric := coalesce((select s.value::numeric from private.app_settings s where s.key = 'ai_budget_usd'), 0);
  v_calls    bigint := 0;
  v_cost     numeric := 0;
  v_exceeded boolean := false;
begin
  if (select auth.uid()) is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  v_support := private.is_support();
  select a.status, a.first_seen, a.last_seen, a.notified_at, a.count into v_alert from public.system_alerts a where a.key = 'ai_credit';
  if v_support or v_b_calls > 0 or v_b_usd > 0 then
    select count(*), coalesce(sum(u.estimated_cost_usd), 0) into v_calls, v_cost from public.ai_usage u where u.created_at >= v_start;
    v_exceeded := (v_b_calls > 0 and v_calls >= v_b_calls) or (v_b_usd > 0 and v_cost >= v_b_usd);
  end if;
  return jsonb_build_object(
    'credit_exhausted', coalesce(v_alert.status, 'ok') = 'alert',
    'since', case when coalesce(v_alert.status, 'ok') = 'alert' then v_alert.first_seen end,
    'budget_exceeded', v_exceeded,
    'month_calls', case when v_support then v_calls end,
    'month_cost_usd', case when v_support then v_cost end,
    'last_seen', case when v_support then v_alert.last_seen end,
    'notified_at', case when v_support then v_alert.notified_at end,
    'alert_count', case when v_support then coalesce(v_alert.count, 0) end
  );
end $$;
comment on function public.ai_service_status() is
  'Crédit IA épuisé (system_alerts.ai_credit) et budget du mois atteint (seuils lus dans private.app_settings, jamais passés par l''appelant), pour toute personne connectée. Les totaux du mois ne sont rendus qu''au support.';
revoke execute on function public.ai_service_status() from public, anon;
grant execute on function public.ai_service_status() to authenticated, service_role;

-- D. Alertes : au plus un e-mail par 24 h -----------------------------------------------------------------------------------
create or replace function private.claim_alert_email(p_key text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_claimed boolean := false;
begin
  -- l'UPDATE verrouille la ligne : deux requêtes simultanées se départagent, une seule voit « notified_at » ancien
  update public.system_alerts a set notified_at = now()
   where a.key = p_key and (a.notified_at is null or a.notified_at <= now() - interval '24 hours')
  returning true into v_claimed;
  return coalesce(v_claimed, false);
end $$;
revoke execute on function private.claim_alert_email(text) from public, anon, authenticated;

create or replace function public.report_ai_billing_error()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into public.system_alerts as a (key, status, first_seen, last_seen, count)
  values ('ai_credit', 'alert', now(), now(), 1)
  on conflict (key) do update
     set first_seen = case when a.status = 'alert' then coalesce(a.first_seen, now()) else now() end,
         count      = case when a.status = 'alert' then a.count + 1 else 1 end,
         status     = 'alert',
         last_seen  = now();
  return private.claim_alert_email('ai_credit');
end $$;
comment on function public.report_ai_billing_error() is
  'Crédit IA épuisé : enregistre l''alerte (system_alerts.ai_credit) et répond TRUE si un e-mail doit être envoyé (au plus un par 24 h). Réservée au serveur (service_role).';

create or replace function public.claim_ai_alert_email(p_key text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_key is null or p_key not in ('ai_credit', 'ai_budget') then
    raise exception 'Alerte inconnue' using errcode = '22023';
  end if;
  insert into public.system_alerts (key, status) values (p_key, 'ok') on conflict (key) do nothing;
  return private.claim_alert_email(p_key);
end $$;
comment on function public.claim_ai_alert_email(text) is
  'TRUE si un e-mail d''alerte peut partir pour cette clé (au plus un par 24 h), sans changer l''état. Réservée au serveur (service_role).';

create or replace function public.reset_ai_credit_alert()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_changed boolean := false;
begin
  -- notified_at est conservé : une panne qui revient dans la journée ne renvoie pas un deuxième e-mail
  update public.system_alerts a set status = 'ok' where a.key = 'ai_credit' and a.status = 'alert'
  returning true into v_changed;
  return coalesce(v_changed, false);
end $$;
comment on function public.reset_ai_credit_alert() is
  'Repasse l''alerte de crédit IA à « ok » (cron de rattrapage). Réservée au serveur (service_role).';

create or replace function public.ai_credit_alert_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.system_alerts a where a.key = 'ai_credit' and a.status = 'alert')
$$;
comment on function public.ai_credit_alert_active() is
  'L''alerte de crédit IA est-elle active ? Pour le cron de rattrapage (n''appelle le fournisseur que si oui). Réservée au serveur (service_role).';

create or replace function public.support_reset_ai_credit()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not private.is_support() then
    raise exception 'Action non autorisée' using errcode = '42501';
  end if;
  return public.reset_ai_credit_alert();
end $$;
comment on function public.support_reset_ai_credit() is
  'Bouton « Réactiver l''IA » de l''écran support : repasse l''alerte de crédit IA à « ok ». Support seulement.';

revoke execute on function public.report_ai_billing_error(), public.claim_ai_alert_email(text), public.reset_ai_credit_alert(), public.ai_credit_alert_active()
  from public, anon, authenticated;
grant execute on function public.report_ai_billing_error(), public.claim_ai_alert_email(text), public.reset_ai_credit_alert(), public.ai_credit_alert_active() to service_role;
revoke execute on function public.support_reset_ai_credit() from public, anon;
grant execute on function public.support_reset_ai_credit() to authenticated;

-- E. E-mails de notification (envoi groupé par le cron) --------------------------------------------------------------------
alter table public.notifications add column if not exists emailed_at timestamptz;
alter table public.notifications add column if not exists claimed_at timestamptz;
comment on column public.notifications.emailed_at is 'Date d''envoi de l''e-mail de notification ; NULL = pas encore envoyé.';
comment on column public.notifications.claimed_at is 'Bail de l''envoi en cours (0028) : une notification réclamée n''est reprise qu''après expiration du bail ; NULL = libre.';
create index if not exists notifications_email_pending_idx on public.notifications (created_at)
  where emailed_at is null and read_at is null and type in ('friend_request', 'group_invitation');

drop function if exists public.claim_notification_emails(integer, interval);
create or replace function public.claim_notification_emails(
  p_limit integer default 40, p_max_age interval default interval '48 hours', p_lease interval default interval '10 minutes')
returns table (id uuid, user_id uuid, type text, payload jsonb, language text, email text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  return query
  with picked as (
    select n.id as nid
      from public.notifications n
      join public.profiles p on p.id = n.user_id
     where n.emailed_at is null and n.read_at is null
       and (n.claimed_at is null or n.claimed_at <= now() - p_lease)
       and n.type in ('friend_request', 'group_invitation')
       and n.created_at > now() - p_max_age
       and p.notifications is not false
     order by n.created_at
     limit greatest(coalesce(p_limit, 40), 0)
       for update of n skip locked
  ), upd as (
    update public.notifications n set claimed_at = now()
      from picked where n.id = picked.nid
    returning n.id as uid_, n.user_id as user_, n.type as type_, n.payload as payload_
  )
  select upd.uid_, upd.user_, upd.type_, upd.payload_,
         case when p.language = 'en' then 'en' else 'fr' end::text,
         au.email::text
    from upd
    join public.profiles p on p.id = upd.user_
    join auth.users au on au.id = upd.user_
   where au.email is not null;
end $$;
comment on function public.claim_notification_emails(integer, interval, interval) is
  'Réclame (bail de p_lease) et renvoie les demandes d''ami / invitations de groupe non lues, récentes et non envoyées dont la personne accepte les e-mails (profiles.notifications). E-mail = celui du compte destinataire. Réservée au serveur (service_role).';

create or replace function public.confirm_notification_emails(p_ids uuid[])
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_n integer;
begin
  update public.notifications n set emailed_at = now(), claimed_at = null
   where n.id = any(coalesce(p_ids, '{}'::uuid[])) and n.emailed_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
comment on function public.confirm_notification_emails(uuid[]) is
  'Marque ces notifications comme envoyées (emailed_at) et lève le bail. Réservée au serveur (service_role).';

create or replace function public.release_notification_emails(p_ids uuid[])
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_n integer;
begin
  update public.notifications n set claimed_at = null
   where n.id = any(coalesce(p_ids, '{}'::uuid[])) and n.emailed_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
comment on function public.release_notification_emails(uuid[]) is
  'Lève le bail de notifications non envoyées (réessai au prochain passage). Réservée au serveur (service_role).';

revoke execute on function public.claim_notification_emails(integer, interval, interval), public.confirm_notification_emails(uuid[]), public.release_notification_emails(uuid[])
  from public, anon, authenticated;
grant execute on function public.claim_notification_emails(integer, interval, interval), public.confirm_notification_emails(uuid[]), public.release_notification_emails(uuid[]) to service_role;

-- F. Réservation atomique d'un appel IA ---------------------------------------------------------------------------------------
-- `pending` : réservation faite, appel au fournisseur en cours. Elle compte tout de suite dans le plafond du jour et le budget du mois.
do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.ai_usage'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%status%' loop
    execute format('alter table public.ai_usage drop constraint %I', c.conname);
  end loop;
  alter table public.ai_usage add constraint ai_usage_status_check check (status in ('ok', 'error', 'pending'));
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
    return jsonb_build_object('ok', false, 'reason', 'quota', 'used', v_used, 'quota', v_quota, 'resets_at', v_day + interval '1 day', 'is_new', v_is_new);
  end if;

  insert into public.ai_usage (user_id, provider, model, feature, status)
    values (p_user, 'pending', 'pending', coalesce(nullif(btrim(p_feature), ''), 'translate'), 'pending')
    returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'used', v_used + 1, 'quota', v_quota, 'resets_at', v_day + interval '1 day', 'is_new', v_is_new);
end $$;
comment on function public.reserve_ai_call(uuid, text, integer, integer, integer, integer, numeric) is
  'Réserve atomiquement un appel IA : verrou par compte, contrôle crédit / budget du mois / plafond du jour, insertion d''une ligne ai_usage « pending ». Renvoie {ok, id | reason, …}. Réservée au serveur (service_role), qui donne l''identité et les seuils.';

create or replace function public.finish_ai_call(
  p_id uuid, p_provider text, p_model text, p_input_tokens integer, p_output_tokens integer,
  p_estimated_cost_usd numeric, p_status text, p_duration_ms integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_done boolean := false;
begin
  if p_status is null or p_status not in ('ok', 'error') then
    raise exception 'Statut invalide' using errcode = '22023';
  end if;
  update public.ai_usage u
     set provider = coalesce(p_provider, u.provider), model = coalesce(p_model, u.model),
         input_tokens = greatest(coalesce(p_input_tokens, 0), 0), output_tokens = greatest(coalesce(p_output_tokens, 0), 0),
         estimated_cost_usd = p_estimated_cost_usd, status = p_status, duration_ms = greatest(p_duration_ms, 0)
   where u.id = p_id and u.status = 'pending'
  returning true into v_done;
  return coalesce(v_done, false);
end $$;
comment on function public.finish_ai_call(uuid, text, text, integer, integer, numeric, text, integer) is
  'Termine une réservation : la ligne « pending » passe à ok / error avec fournisseur, modèle, tokens, coût estimé, durée. Réservée au serveur (service_role).';

revoke execute on function public.reserve_ai_call(uuid, text, integer, integer, integer, integer, numeric),
  public.finish_ai_call(uuid, text, text, integer, integer, numeric, text, integer) from public, anon, authenticated;
grant execute on function public.reserve_ai_call(uuid, text, integer, integer, integer, integer, numeric),
  public.finish_ai_call(uuid, text, text, integer, integer, numeric, text, integer) to service_role;

notify pgrst, 'reload schema';

do $$
begin
  assert exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'ai_daily_quota'), '[0028] profiles.ai_daily_quota absente';
  assert exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'notifications' and column_name = 'emailed_at'), '[0028] notifications.emailed_at absente';
  assert to_regprocedure('public.ai_quota_status(integer, integer, integer)') is not null, '[0028] ai_quota_status absente';
  assert to_regprocedure('public.ai_service_status()') is not null, '[0028] ai_service_status absente';
  assert to_regprocedure('public.reserve_ai_call(uuid, text, integer, integer, integer, integer, numeric)') is not null, '[0028] reserve_ai_call absente';
  assert not has_function_privilege('authenticated', 'public.reserve_ai_call(uuid, text, integer, integer, integer, integer, numeric)', 'execute'), '[0028] reserve_ai_call ne doit pas être appelable par authenticated';
  assert not has_table_privilege('authenticated', 'private.app_settings', 'select'), '[0028] app_settings ne doit pas être lisible par l''API';
  assert to_regprocedure('public.report_ai_billing_error()') is not null, '[0028] report_ai_billing_error absente';
  assert not has_function_privilege('authenticated', 'public.report_ai_billing_error()', 'execute'), '[0028] report_ai_billing_error ne doit pas être appelable par authenticated';
  assert not has_function_privilege('authenticated', 'public.claim_notification_emails(integer, interval, interval)', 'execute'), '[0028] claim_notification_emails ne doit pas être appelable par authenticated';
  assert not has_column_privilege('authenticated', 'public.profiles', 'ai_daily_quota', 'update'), '[0028] ai_daily_quota ne doit pas être modifiable par l''API';
  raise notice '[0028] quota IA par compte, état du crédit, budget, e-mails de notification : OK';
end $$;

commit;
