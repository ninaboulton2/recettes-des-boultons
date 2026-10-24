-- Retour arrière de 0028 : supprime les fonctions, l'index et les deux colonnes ajoutées.
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
drop function if exists public.claim_notification_emails(integer, interval);
drop function if exists public.ai_service_status(integer, numeric);
drop function if exists public.ai_quota_status(integer, integer, integer);
drop index if exists public.notifications_email_pending_idx;
alter table public.notifications drop column if exists emailed_at;
alter table public.profiles drop constraint if exists profiles_ai_daily_quota_check;
alter table public.profiles drop column if exists ai_daily_quota;
delete from public.system_alerts where key = 'ai_budget';
notify pgrst, 'reload schema';
commit;
