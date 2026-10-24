-- Retour arrière de 0025 : restaure update_my_profile telle que livrée par 0023 (6 paramètres, sans onboarded_at).
-- À jouer AVANT le retour arrière de 0023. Les clients qui passent p_complete_onboarding échoueront : retirer d'abord le code v2.
begin;
drop function if exists public.update_my_profile(text, text, boolean, jsonb, uuid, boolean, boolean);

create or replace function public.update_my_profile(
  p_display_name          text    default null,
  p_cookbook_title        text    default null,
  p_discoverable          boolean default null,
  p_theme_settings        jsonb   default null,
  p_active_theme_group_id uuid    default null,
  p_personal_theme        boolean default false
)
returns table (display_name text, cookbook_title text, discoverable boolean, theme_settings jsonb, active_theme_group_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me    uuid := (select auth.uid());
  v_name  text;
  v_title text;
begin
  if v_me is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_me) then
    raise exception 'Profil introuvable' using errcode = 'P0002';
  end if;
  if p_display_name is not null then
    v_name := btrim(p_display_name);
    if char_length(v_name) not between 1 and 60 then
      raise exception 'Le pseudonyme doit faire de 1 à 60 caractères' using errcode = '22023';
    end if;
  end if;
  if p_cookbook_title is not null then
    v_title := nullif(btrim(p_cookbook_title), '');
    if char_length(coalesce(v_title, '')) > 80 then
      raise exception 'Le titre du carnet doit faire 80 caractères au plus' using errcode = '22023';
    end if;
  end if;
  if p_theme_settings is not null then
    if jsonb_typeof(p_theme_settings) <> 'object' then
      raise exception 'Le thème doit être un objet JSON' using errcode = '22023';
    end if;
    if char_length(p_theme_settings::text) > 4000 then
      raise exception 'Thème trop volumineux (4000 caractères au plus)' using errcode = '22023';
    end if;
  end if;
  if p_personal_theme and p_active_theme_group_id is not null then
    raise exception 'Choisissez un groupe OU le thème personnel' using errcode = '22023';
  end if;
  if p_active_theme_group_id is not null and not exists (
       select 1 from public.group_members m where m.group_id = p_active_theme_group_id and m.user_id = v_me) then
    raise exception 'Le thème actif doit être celui d''un groupe dont vous êtes membre' using errcode = '42501';
  end if;

  -- le déclencheur trg_0023_profiles_display_name applique « @ » et doublon ; trg_profiles_guard_active_theme (0019) le groupe
  update public.profiles p
     set display_name          = coalesce(v_name, p.display_name),
         cookbook_title        = case when p_cookbook_title is null then p.cookbook_title else v_title end,
         discoverable          = coalesce(p_discoverable, p.discoverable),
         theme_settings        = case when p_theme_settings is null then p.theme_settings
                                      when p_theme_settings = '{}'::jsonb then null else p_theme_settings end,
         active_theme_group_id = case when p_personal_theme then null
                                      else coalesce(p_active_theme_group_id, p.active_theme_group_id) end
   where p.id = v_me;

  return query
    select p.display_name, p.cookbook_title, p.discoverable, p.theme_settings, p.active_theme_group_id
      from public.profiles p where p.id = v_me;
end;
$$;
comment on function public.update_my_profile(text, text, boolean, jsonb, uuid, boolean) is
  'Met à jour MON profil (paramètre NULL = inchangé ; titre '''' = effacer ; thème ''{}'' = effacer ; p_personal_theme => true = thème personnel). Pseudonyme 1-60 caractères, sans « @ », unique ; titre ≤ 80 ; thème objet ≤ 4000 caractères ; thème actif = un de mes groupes. Renvoie les valeurs enregistrées. 0023.';

revoke execute on function public.update_my_profile(text, text, boolean, jsonb, uuid, boolean) from public, anon, authenticated;
grant execute on function public.update_my_profile(text, text, boolean, jsonb, uuid, boolean) to authenticated, service_role;
commit;
