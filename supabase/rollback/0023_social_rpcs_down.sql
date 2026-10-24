-- ============================================================================
--  Retour arrière de 0023 — fonctions métier côté social
-- ============================================================================
--  QUAND : pour revenir à l'état d'après 0021 (ou 0019). Aucune table de 0017 / 0019 n'est touchée et aucune
--  donnée sociale n'est supprimée : amitiés, groupes, invitations, droits, carnets restent ; les NOTIFICATIONS déjà
--  créées restent dans `public.notifications`. Seuls disparaissent : les 29 fonctions publiques, les aides internes
--  `private.*` de 0023, les 9 déclencheurs `trg_0023_*` (donc plus de notifications automatiques, plus de limite de
--  débit, plus de règle sur le pseudonyme, plus de notification à la suppression d'une recette) et le journal
--  `private.rate_events` (les compteurs de limite repartent de zéro à la ré-application).
--  Les clients v2 qui appellent les fonctions supprimées échouent (le code v2 doit être retiré avant).
--  Rejouable : tout est `if exists`.
-- ============================================================================

begin;

drop trigger if exists trg_0023_recipe_deleted        on public.recipes;
drop trigger if exists trg_0023_profiles_display_name on public.profiles;
drop trigger if exists trg_0023_reports_rate_limit    on public.reports;
drop trigger if exists trg_0023_grants_notify         on public.recipe_grants;
drop trigger if exists trg_0023_invitations_notify    on public.invitations;
drop trigger if exists trg_0023_invitations_before    on public.invitations;
drop trigger if exists trg_0023_friendships_cleanup   on public.friendships;
drop trigger if exists trg_0023_friendships_notify    on public.friendships;
drop trigger if exists trg_0023_friendships_before    on public.friendships;

drop function if exists public.prepare_account_deletion(uuid);
drop function if exists public.account_deletion_blockers();
drop function if exists public.export_my_data();
drop function if exists public.get_user_profile(uuid);
drop function if exists public.update_my_profile(text, text, boolean, jsonb, uuid, boolean);
drop function if exists public.unread_notifications_count();
drop function if exists public.mark_notifications_read(uuid[]);
drop function if exists public.list_notifications(int, timestamptz);
drop function if exists public.redeem_invite_link(text);
drop function if exists public.create_invite_link(uuid);
drop function if exists public.list_group_invitations();
drop function if exists public.list_group_members(uuid);
drop function if exists public.list_my_groups();
drop function if exists public.delete_group(uuid);
drop function if exists public.transfer_group_ownership(uuid, uuid);
drop function if exists public.remove_group_member(uuid, uuid);
drop function if exists public.leave_group(uuid);
drop function if exists public.respond_group_invitation(uuid, boolean);
drop function if exists public.cancel_group_invitation(uuid);
drop function if exists public.invite_to_group(uuid, uuid);
drop function if exists public.update_group_theme(uuid, jsonb);
drop function if exists public.rename_group(uuid, text);
drop function if exists public.create_group(text);
drop function if exists public.list_friend_requests();
drop function if exists public.list_friends();
drop function if exists public.remove_friend(uuid);
drop function if exists public.cancel_friend_request(uuid);
drop function if exists public.respond_friend_request(uuid, boolean);
drop function if exists public.send_friend_request(uuid);

drop function if exists private.trg_profiles_guard_display_name();
drop function if exists private.trg_recipes_notify_deleted();
drop function if exists private.trg_reports_rate_limit();
drop function if exists private.trg_grants_notify();
drop function if exists private.trg_invitations_notify();
drop function if exists private.trg_invitations_before();
drop function if exists private.trg_friendships_cleanup();
drop function if exists private.trg_friendships_notify();
drop function if exists private.trg_friendships_before();
drop function if exists private.level_of(uuid, uuid);
drop function if exists private.require_group_creator(uuid);
drop function if exists private.check_rate_limit(text, int, text);
drop function if exists private.notify(uuid, text, jsonb);
drop function if exists private.display_name_of(uuid);

drop table if exists private.rate_events;
drop table if exists private.tmp_0023_before;

notify pgrst, 'reload schema';

commit;
