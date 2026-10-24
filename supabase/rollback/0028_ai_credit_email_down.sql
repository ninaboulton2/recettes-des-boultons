-- Retour arrière de 0028 : supprime les fonctions, la table private.app_settings, l'index et les trois colonnes ajoutées, et rétablit la contrainte de ai_usage.status.
-- Aucune autre donnée n'est touchée (la ligne system_alerts « ai_credit » éventuelle reste : sans effet). Sans effet sur la v1.
-- Avant de l'appliquer : retirer le code phase 7 (le serveur v2 appelle ces fonctions) ou repasser NUXT_PUBLIC_V2 à false. Rejouable.
begin;
drop function if exists public.support_reset_ai_credit();
drop function if exists public.ai_credit_alert_active();
drop function if exists public.reset_ai_credit_alert();
drop function if exists public.claim_ai_alert_email(text);
drop function if exists public.report_ai_billing_error();
drop function if exists private.claim_alert_email(text);
drop function if exists public.release_notification_emails(uuid[]);
drop function if exists public.confirm_notification_emails(uuid[]);
drop function if exists public.claim_notification_emails(integer, interval, interval);
drop function if exists public.finish_ai_call(uuid, text, text, integer, integer, numeric, text, integer);
drop function if exists public.reserve_ai_call(uuid, text, integer, integer, integer, integer, numeric);
drop function if exists public.ai_service_status();
drop table if exists private.app_settings;
drop function if exists public.ai_quota_status(integer, integer, integer);
drop index if exists public.notifications_email_pending_idx;
alter table public.notifications drop column if exists claimed_at;
alter table public.notifications drop column if exists emailed_at;
-- ai_usage.status : retour à ('ok', 'error') ; une réservation encore « pending » devient une erreur (elle comptait déjà)
update public.ai_usage set status = 'error' where status = 'pending';
alter table public.ai_usage drop constraint if exists ai_usage_status_check;
alter table public.ai_usage add constraint ai_usage_status_check check (status in ('ok', 'error'));
alter table public.profiles drop constraint if exists profiles_ai_daily_quota_check;
alter table public.profiles drop column if exists ai_daily_quota;
delete from public.system_alerts where key = 'ai_budget';
notify pgrst, 'reload schema';
commit;
