-- Test 0028 — quota IA par compte, état du crédit, budget du mois, alertes (une par 24 h), e-mails de notification.
-- Sous la chaîne COMPLÈTE (… → 0020 → 0027 → 0028). a = Nina (admin = support), d et e = membres ordinaires. Transaction annulée.
begin;

create or replace function tests.try(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return sqlstate; end $$;
grant execute on function tests.try(text) to anon, authenticated, service_role;

do $$
declare
  a constant uuid := '00000000-0000-0000-0000-00000000000a';
  d constant uuid := '00000000-0000-0000-0000-0000000000d8';
  e constant uuid := '00000000-0000-0000-0000-0000000000e8';
  s jsonb; sent boolean; n int; r record; first_seen_1 timestamptz;
begin
  insert into auth.users (id, email, raw_user_meta_data) values (d, 'dave8@test.local', '{}'), (e, 'eve8@test.local', '{}');
  update public.profiles set display_name = 'Dave Huit' where id = d;
  update public.profiles set display_name = 'Eve Huit', language = 'en' where id = e;

  -- A/B. quota par compte -----------------------------------------------------------------------------------------------------
  -- d : compte neuf (créé maintenant) → quota des nouveaux comptes
  perform tests.login(d, 'authenticated');
  s := public.ai_quota_status(50, 20, 30);
  assert (s ->> 'quota')::int = 20 and (s ->> 'used')::int = 0 and (s ->> 'is_new')::boolean and not (s ->> 'has_override')::boolean, 'compte neuf : 20';
  assert (s ->> 'resets_at')::timestamptz > now() and (s ->> 'resets_at')::timestamptz <= now() + interval '25 hours', 'remise à zéro dans moins de 25 h';
  assert ((s ->> 'resets_at')::timestamptz at time zone 'Europe/Paris')::time = '00:00', 'remise à zéro à minuit, heure de Paris';
  perform tests.logout();

  -- d : compte ancien → quota général ; l'API ne peut pas modifier son propre plafond
  update public.profiles set created_at = now() - interval '90 days' where id = d;
  perform tests.login(d, 'authenticated');
  assert (public.ai_quota_status(50, 20, 30) ->> 'quota')::int = 50 and not (public.ai_quota_status(50, 20, 30) ->> 'is_new')::boolean, 'compte ancien : 50';
  assert tests.try(format($q$update public.profiles set ai_daily_quota = 9999 where id = %L$q$, d)) = '42501', 'un membre ne règle pas son propre plafond';
  assert (public.ai_quota_status(50, 20, 0) ->> 'quota')::int = 50, 'N jours = 0 : plus de « nouveau »';
  -- appels du jour comptés (ok et erreur), ceux d'hier non
  insert into public.ai_usage (user_id, provider, model, status) values (d, 'mock', 'm', 'ok'), (d, 'mock', 'm', 'error');
  perform tests.logout();
  insert into public.ai_usage (user_id, provider, model, status, created_at) values (d, 'mock', 'm', 'ok', now() - interval '2 days');
  perform tests.login(d, 'authenticated');
  assert (public.ai_quota_status(50, 20, 30) ->> 'used')::int = 2, 'deux appels aujourd''hui (hier non compté)';
  perform tests.logout();

  -- plafond personnel (posé par le support / le propriétaire de la base) : prioritaire
  update public.profiles set ai_daily_quota = 2 where id = d;
  perform tests.login(d, 'authenticated');
  s := public.ai_quota_status(50, 20, 30);
  assert (s ->> 'quota')::int = 2 and (s ->> 'has_override')::boolean and (s ->> 'used')::int >= (s ->> 'quota')::int, 'plafond personnel atteint';
  perform tests.logout();
  update public.profiles set ai_daily_quota = 0 where id = d;   -- 0 = IA coupée pour ce compte
  perform tests.login(d, 'authenticated');
  assert (public.ai_quota_status(50, 20, 30) ->> 'quota')::int = 0, 'plafond 0';
  perform tests.logout();
  assert tests.try('update public.profiles set ai_daily_quota = -1 where id = ''' || d || '''') = '23514', 'plafond négatif refusé';
  -- check_ai_quota (v1) inchangée
  perform tests.login(d, 'authenticated');
  assert public.check_ai_quota(3) = true and public.check_ai_quota(2) = false, 'check_ai_quota de la v1 inchangée';
  perform tests.logout();

  -- C/D. crédit épuisé --------------------------------------------------------------------------------------------------------
  perform tests.login(e, 'authenticated');
  s := public.ai_service_status(0, 0);
  assert not (s ->> 'credit_exhausted')::boolean and not (s ->> 'budget_exceeded')::boolean, 'état initial : ok';
  assert s -> 'month_calls' = 'null'::jsonb, 'un membre ne voit pas les totaux du mois';
  assert tests.try('select public.report_ai_billing_error()') = '42501', 'un membre ne peut pas déclarer une panne';
  assert tests.try('select public.reset_ai_credit_alert()') = '42501', 'un membre ne peut pas lever l''alerte';
  assert tests.try('select public.support_reset_ai_credit()') = '42501', 'un membre n''est pas le support';
  assert tests.try('select public.claim_ai_alert_email(''ai_credit'')') = '42501', 'un membre ne prend pas l''e-mail d''alerte';
  assert (select count(*) from public.system_alerts) = 0, 'system_alerts invisible pour un membre';
  assert tests.try('update public.system_alerts set status = ''ok''') = '42501', 'system_alerts non modifiable par l''API';
  perform tests.logout();
  perform tests.login(null, 'anon');
  assert tests.try('select public.ai_service_status(0, 0)') = '42501', 'anon : refusé';
  perform tests.logout();

  perform tests.login(a, 'service_role');
  sent := public.report_ai_billing_error();
  assert sent, 'première panne : e-mail à envoyer';
  assert not public.report_ai_billing_error(), 'deuxième panne dans la minute : pas de nouvel e-mail';
  assert not public.report_ai_billing_error(), 'troisième : idem';
  perform tests.logout();
  select count, first_seen, status into r from public.system_alerts where key = 'ai_credit';
  assert r.status = 'alert' and r.count = 3 and r.first_seen is not null, 'compteur et date de première apparition';
  first_seen_1 := r.first_seen;

  perform tests.login(e, 'authenticated');
  s := public.ai_service_status(0, 0);
  assert (s ->> 'credit_exhausted')::boolean and (s ->> 'since') is not null, 'tout compte connecté voit « crédit épuisé »';
  assert s -> 'alert_count' = 'null'::jsonb, 'pas de détail pour un membre';
  perform tests.logout();

  -- 24 h plus tard : un nouvel e-mail est permis, pas avant
  update public.system_alerts set notified_at = now() - interval '23 hours' where key = 'ai_credit';
  perform tests.login(a, 'service_role');
  assert not public.report_ai_billing_error(), '23 h après : toujours pas';
  perform tests.logout();
  update public.system_alerts set notified_at = now() - interval '25 hours' where key = 'ai_credit';
  perform tests.login(a, 'service_role');
  assert public.report_ai_billing_error(), '25 h après : e-mail permis';
  assert not public.report_ai_billing_error(), 'puis plus rien pendant 24 h';
  perform tests.logout();

  -- le support voit le détail et réactive
  perform tests.login(a, 'authenticated', '{"user_role":"admin"}');
  s := public.ai_service_status(0, 0);
  assert (s ->> 'alert_count')::int = 6 and (s ->> 'last_seen') is not null and (s ->> 'notified_at') is not null, 'le support voit le détail';
  assert (select count(*) from public.system_alerts where key = 'ai_credit') = 1, 'le support lit system_alerts (politique 0019)';
  assert public.support_reset_ai_credit(), 'le support réactive l''IA';
  assert not public.support_reset_ai_credit(), 'déjà réactivée : rien à faire';
  assert not (public.ai_service_status(0, 0) ->> 'credit_exhausted')::boolean, 'état revenu à ok';
  perform tests.logout();
  -- une panne qui revient dans la journée n'envoie pas de deuxième e-mail ; un nouvel épisode remet le compteur et la date à zéro
  perform tests.login(a, 'service_role');
  assert not public.report_ai_billing_error(), 'panne revenue dans la journée : pas d''e-mail';
  perform tests.logout();
  select count, first_seen into r from public.system_alerts where key = 'ai_credit';
  assert r.count = 1 and r.first_seen >= first_seen_1, 'nouvel épisode : compteur remis à 1';
  perform tests.login(a, 'service_role');
  assert public.reset_ai_credit_alert(), 'le serveur lève l''alerte (cron)';
  assert not public.reset_ai_credit_alert(), 'idempotent';
  perform tests.logout();

  -- alerte de budget : même limite, sans changer l'état du crédit
  perform tests.login(a, 'service_role');
  assert tests.try('select public.claim_ai_alert_email(''autre'')') = '22023', 'clé inconnue refusée';
  assert public.claim_ai_alert_email('ai_budget'), 'budget : premier e-mail';
  assert not public.claim_ai_alert_email('ai_budget'), 'budget : pas deux fois en 24 h';
  perform tests.logout();
  assert (select status from public.system_alerts where key = 'ai_budget') = 'ok', 'ai_budget reste « ok » (simple limiteur)';
  assert (select status from public.system_alerts where key = 'ai_credit') = 'ok', 'le budget ne touche pas au crédit';

  -- budget du mois (appels et dollars estimés, tous comptes)
  delete from public.ai_usage;
  insert into public.ai_usage (user_id, provider, model, status, estimated_cost_usd)
    select d, 'mock', 'm', 'ok', 0.5 from generate_series(1, 4);
  insert into public.ai_usage (user_id, provider, model, status, estimated_cost_usd, created_at)
    values (d, 'mock', 'm', 'ok', 100, date_trunc('month', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris' - interval '1 day');
  perform tests.login(e, 'authenticated');
  assert not (public.ai_service_status(5, 0) ->> 'budget_exceeded')::boolean, '4 appels < 5';
  assert (public.ai_service_status(4, 0) ->> 'budget_exceeded')::boolean, '4 appels >= 4';
  assert not (public.ai_service_status(0, 2.5) ->> 'budget_exceeded')::boolean, '2 $ < 2,5 $ (le mois dernier ne compte pas)';
  assert (public.ai_service_status(0, 2) ->> 'budget_exceeded')::boolean, '2 $ >= 2 $';
  assert not (public.ai_service_status(0, 0) ->> 'budget_exceeded')::boolean, '0 = pas de budget';
  perform tests.logout();
  perform tests.login(a, 'authenticated', '{"user_role":"admin"}');
  s := public.ai_service_status(0, 0);
  assert (s ->> 'month_calls')::int = 4 and (s ->> 'month_cost_usd')::numeric = 2, 'le support voit les totaux du mois';
  perform tests.logout();

  -- E. e-mails de notification --------------------------------------------------------------------------------------------------
  delete from public.notifications;
  insert into public.notifications (user_id, type, payload, created_at) values
    (e, 'friend_request',  '{"from_name":"Dave Huit"}', now() - interval '1 hour'),
    (e, 'group_invitation','{"from_name":"Dave Huit","group_name":"Les Huit"}', now() - interval '30 minutes'),
    (e, 'recipe_shared',   '{"title":"x"}', now()),                                    -- type sans e-mail
    (e, 'friend_request',  '{"from_name":"Vieux"}', now() - interval '3 days'),       -- trop ancienne
    (d, 'friend_request',  '{"from_name":"Eve"}', now()),                             -- d refuse les e-mails (ci-dessous)
    (a, 'friend_request',  '{"from_name":"Lu"}', now());
  update public.notifications set read_at = now() where payload ->> 'from_name' = 'Lu';  -- déjà lue : pas d'e-mail
  update public.profiles set notifications = false where id = d;

  perform tests.login(e, 'authenticated');
  assert tests.try('select * from public.claim_notification_emails()') = '42501', 'un membre ne réclame pas les e-mails';
  assert tests.try('select public.release_notification_emails(array[gen_random_uuid()])') = '42501', 'ni ne les relâche';
  perform tests.logout();

  perform tests.login(a, 'service_role');
  select count(*) into n from public.claim_notification_emails();
  assert n = 2, format('2 e-mails à envoyer (demande d''ami + invitation de e), obtenu %s', n);
  perform tests.logout();
  assert (select count(*) from public.notifications where emailed_at is not null) = 2, 'les 2 lignes sont marquées';
  perform tests.login(a, 'service_role');
  select count(*) into n from public.claim_notification_emails();
  assert n = 0, 'deuxième passage : rien (pas de doublon)';
  perform tests.logout();

  -- contenu : e-mail du compte destinataire (jamais celui d'un tiers), langue du profil
  update public.notifications set emailed_at = null where type = 'friend_request' and payload ->> 'from_name' = 'Dave Huit';
  perform tests.login(a, 'service_role');
  select * into r from public.claim_notification_emails();
  assert r.user_id = e and r.email = 'eve8@test.local' and r.language = 'en' and r.type = 'friend_request', 'destinataire, e-mail du compte et langue';
  assert r.payload ->> 'from_name' = 'Dave Huit' and not (r.payload::text like '%dave8@%'), 'pseudonyme seulement, aucune adresse d''un tiers';
  -- échec d'envoi : on relâche, et la ligne repart au passage suivant
  assert public.release_notification_emails(array[r.id]) = 1, 'relâchée';
  select count(*) into n from public.claim_notification_emails();
  assert n = 1, 'réclamée de nouveau';
  perform tests.logout();

  -- limite et ordre
  update public.notifications set emailed_at = null;
  perform tests.login(a, 'service_role');
  select count(*) into n from public.claim_notification_emails(1);
  assert n = 1, 'limite respectée';
  perform tests.logout();

  raise notice '[test 0028] quota par compte, crédit, budget, alertes, e-mails : OK';
end $$;

rollback;
