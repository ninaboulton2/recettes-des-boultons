-- ============================================================================
--  0033 — Export « mes données » : rayon des articles de courses et rayons préférés (retour de test n° 2, suite)
-- ============================================================================
--  QUOI : `export_my_data()` (0023) est redéfinie à l'identique, avec en plus `shopping_lists[].items[].aisle` et la clé
--  `shopping_aisle_prefs` (mes rayons préférés : `name_key`, `aisle`, `updated_at`). Rien d'autre ne change (droits, limite de 3 par jour).
--  SANS EFFET SUR LA V1 : fonction remplacée, deux clés de plus dans le JSON. Compatible SQL Editor (aucune table temporaire). Rejouable.
--  Retour arrière : supabase/rollback/0033_export_aisle_down.sql (rétablit la version de 0023). Prérequis : 0023, 0032.
-- ============================================================================
begin;

do $$
begin
  assert to_regclass('public.shopping_aisle_prefs') is not null, '[0033] 0032 absente : appliquer 0032 d''abord';
  assert to_regprocedure('public.export_my_data()') is not null, '[0033] 0023 absente';
end $$;

create or replace function public.export_my_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  j    jsonb;
begin
  if v_me is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  perform private.check_rate_limit('export', 3, 'Limite atteinte : 3 exports par jour. Réessayez demain.');

  select jsonb_build_object(
    'exported_at', now(),
    'profile', (select jsonb_build_object(
                  'id', p.id, 'email', p.email, 'name', p.name, 'display_name', p.display_name,
                  'cookbook_title', p.cookbook_title, 'language', p.language, 'theme', p.theme,
                  'theme_settings', p.theme_settings, 'discoverable', p.discoverable,
                  'active_theme_group', (select g.name from public.groups g where g.id = p.active_theme_group_id),
                  'onboarded_at', p.onboarded_at, 'created_at', p.created_at)
                  from public.profiles p where p.id = v_me),
    'recipes', coalesce((
      select jsonb_agg(((to_jsonb(r) - 'search') || jsonb_build_object(
               'sections', coalesce((
                 select jsonb_agg(((to_jsonb(s) - 'recipe_id') || jsonb_build_object(
                          'ingredients', coalesce((select jsonb_agg(to_jsonb(i) - 'recipe_id' - 'section_id' order by i.order_index, i.id)
                                                     from public.recipe_ingredients i where i.section_id = s.id), '[]'::jsonb),
                          'instructions', coalesce((select jsonb_agg(to_jsonb(n) - 'recipe_id' - 'section_id' order by n.order_index, n.id)
                                                      from public.instructions n where n.section_id = s.id), '[]'::jsonb)))
                          order by s.order_index, s.id)
                   from public.recipe_sections s where s.recipe_id = r.id), '[]'::jsonb),
               'translations', coalesce((select jsonb_agg(to_jsonb(t) - 'search' - 'recipe_id' order by t.locale)
                                           from public.recipe_translations t where t.recipe_id = r.id), '[]'::jsonb),
               'public_link_token', (select l.token from public.recipe_share_links l where l.recipe_id = r.id)))
             order by r.created_at, r.id)
        from public.recipes r where r.owner_id = v_me), '[]'::jsonb),
    'recipes_shared_by_me', coalesce((
      select jsonb_agg(jsonb_build_object(
               'recipe_id', g.recipe_id, 'recipe_title', r.title, 'permission', g.permission, 'origin', g.origin,
               'to_person', private.display_name_of(g.grantee_user_id),
               'to_group', (select x.name from public.groups x where x.id = g.grantee_group_id),
               'created_at', g.created_at) order by g.created_at, g.id)
        from public.recipe_grants g join public.recipes r on r.id = g.recipe_id
       where r.owner_id = v_me), '[]'::jsonb),
    'recipes_shared_with_me', coalesce((
      select jsonb_agg(jsonb_build_object(
               'recipe_id', g.recipe_id, 'recipe_title', r.title, 'permission', g.permission, 'origin', g.origin,
               'from_person', private.display_name_of(g.granted_by), 'created_at', g.created_at) order by g.created_at, g.id)
        from public.recipe_grants g join public.recipes r on r.id = g.recipe_id
       where g.grantee_user_id = v_me), '[]'::jsonb),
    'cookbook_entries', coalesce((
      select jsonb_agg(jsonb_build_object(
               'recipe_id', e.recipe_id,
               'recipe_title', case when private.recipe_level(e.recipe_id) >= 1 then r.title end,
               'author', case when private.recipe_level(e.recipe_id) >= 1 then private.display_name_of(r.owner_id) end,
               'category', (select c.slug from public.categories c where c.id = e.category_id),
               'added_at', e.created_at) order by e.created_at, e.recipe_id)
        from public.cookbook_entries e join public.recipes r on r.id = e.recipe_id
       where e.user_id = v_me), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('slug', c.slug, 'name_fr', c.name_fr, 'name_en', c.name_en, 'icon', c.icon,
                                          'color', c.color, 'sort_order', c.sort_order, 'created_at', c.created_at)
                       order by c.sort_order, c.slug)
        from public.categories c where c.owner_id = v_me), '[]'::jsonb),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.id, 'name', g.name, 'role', m.role, 'theme', g.theme, 'joined_at', m.created_at,
               'created_by', private.display_name_of(g.created_by),
               'members', coalesce((select jsonb_agg(private.display_name_of(x.user_id) order by x.created_at, x.user_id)
                                      from public.group_members x where x.group_id = g.id), '[]'::jsonb))
             order by m.created_at, g.id)
        from public.group_members m join public.groups g on g.id = m.group_id
       where m.user_id = v_me), '[]'::jsonb),
    'friends', coalesce((
      select jsonb_agg(jsonb_build_object('name', private.display_name_of(
               case when f.requester_id = v_me then f.addressee_id else f.requester_id end), 'since', f.responded_at)
             order by f.responded_at, f.id)
        from public.friendships f
       where f.status = 'accepted' and (f.requester_id = v_me or f.addressee_id = v_me)), '[]'::jsonb),
    'friend_requests', coalesce((
      select jsonb_agg(jsonb_build_object(
               'direction', case when f.addressee_id = v_me then 'incoming' else 'outgoing' end,
               'name', private.display_name_of(case when f.requester_id = v_me then f.addressee_id else f.requester_id end),
               'status', f.status, 'created_at', f.created_at) order by f.created_at, f.id)
        from public.friendships f
       where f.status <> 'accepted' and (f.requester_id = v_me or f.addressee_id = v_me)), '[]'::jsonb),
    'group_invitations', coalesce((
      select jsonb_agg(jsonb_build_object(
               'direction', case when i.target_user_id = v_me then 'received' else 'sent' end,
               'group', g.name, 'status', i.status,
               'person', private.display_name_of(case when i.target_user_id = v_me then i.inviter_id else i.target_user_id end),
               'created_at', i.created_at) order by i.created_at, i.id)
        from public.invitations i join public.groups g on g.id = i.group_id
       where i.kind = 'group' and (i.target_user_id = v_me or i.inviter_id = v_me)), '[]'::jsonb),
    'favorites', coalesce((
      select jsonb_agg(jsonb_build_object(
               'recipe_id', f.recipe_id, 'recipe_title', case when private.recipe_level(f.recipe_id) >= 1 then r.title end,
               'created_at', f.created_at) order by f.created_at, f.id)
        from public.favorites f left join public.recipes r on r.id = f.recipe_id
       where f.user_id = v_me), '[]'::jsonb),
    'planning', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', pl.date_string, 'meal_type', pl.meal_type, 'recipe_id', pl.recipe_id,
               'recipe_title', case when pl.recipe_id is not null and private.recipe_level(pl.recipe_id) >= 1 then r.title end,
               'custom_title', pl.custom_title, 'created_at', pl.created_at) order by pl.date_string, pl.meal_type, pl.id)
        from public.planning pl left join public.recipes r on r.id = pl.recipe_id
       where pl.user_id = v_me), '[]'::jsonb),
    'planning_notes', coalesce((
      select jsonb_agg(jsonb_build_object('date', pn.date_string, 'note_type', pn.note_type, 'content', pn.content,
                                          'created_at', pn.created_at) order by pn.date_string, pn.id)
        from public.planning_notes pn where pn.user_id = v_me), '[]'::jsonb),
    'shopping_lists', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', l.name, 'created_at', l.created_at,
               'items', coalesce((select jsonb_agg(jsonb_build_object(
                                    'name', it.name, 'amount', it.amount, 'unit', it.unit, 'checked', it.is_checked,
                                    'aisle', it.aisle, 'created_at', it.created_at) order by it.created_at, it.id)
                                    from public.shopping_items it where it.list_id = l.id), '[]'::jsonb))
             order by l.created_at, l.id)
        from public.shopping_lists l where l.user_id = v_me), '[]'::jsonb),
    'shopping_aisle_prefs', coalesce((
      select jsonb_agg(jsonb_build_object('name_key', ap.name_key, 'aisle', ap.aisle, 'updated_at', ap.updated_at) order by ap.name_key)
        from public.shopping_aisle_prefs ap where ap.user_id = v_me), '[]'::jsonb),
    'ai_usage', coalesce((
      select jsonb_agg(jsonb_build_object(
               'created_at', u.created_at, 'feature', u.feature, 'provider', u.provider, 'model', u.model,
               'input_tokens', u.input_tokens, 'output_tokens', u.output_tokens,
               'estimated_cost_usd', u.estimated_cost_usd, 'status', u.status) order by u.created_at, u.id)
        from public.ai_usage u where u.user_id = v_me), '[]'::jsonb),
    'notifications', coalesce((
      select jsonb_agg(jsonb_build_object(
               'type', n.type, 'payload', n.payload - 'from_user_id' - 'user_id' - 'author_id',
               'read_at', n.read_at, 'created_at', n.created_at) order by n.created_at, n.id)
        from public.notifications n where n.user_id = v_me), '[]'::jsonb),
    'dismissed_banners', coalesce((
      select jsonb_agg(jsonb_build_object('kind', d.kind, 'recipe_id', case when d.kind = 'new_recipe' then d.target_id end,
                                          'created_at', d.created_at) order by d.created_at, d.target_id)
        from public.dismissed_prompts d where d.user_id = v_me), '[]'::jsonb),
    'reports_filed', coalesce((
      select jsonb_agg(jsonb_build_object('recipe_id', rp.recipe_id, 'reason', rp.reason, 'details', rp.details,
                                          'status', rp.status, 'created_at', rp.created_at) order by rp.created_at, rp.id)
        from public.reports rp where rp.reporter_id = v_me), '[]'::jsonb)
  ) into j;
  return j;
end;
$$;
comment on function public.export_my_data() is
  'Toutes MES données en jsonb (profil, recettes complètes, droits, carnet, catégories, groupes, amis, favoris, planning, courses avec leur rayon et mes rayons préférés, notifications…). Les autres personnes n''y figurent que par pseudonyme (aucun identifiant de personne, aucun e-mail). 3 exports par jour (54000). 0023, 0033.';

notify pgrst, 'reload schema';
commit;
