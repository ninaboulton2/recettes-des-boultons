-- ============================================================================
--  Retour arrière de v2/0018 — défait le remplissage (les Boultons redeviennent « sans propriétaire »)
-- ============================================================================
--  QUAND : pour revenir à l'état d'après 0017 + 0019 (avant le remplissage).
--  PRÉREQUIS : la bascule v2/0020 doit être retirée AVANT (owner_id est alors NOT NULL et
--  les politiques lisent owner_id) : rollback/0020_rls_switchover_down.sql. Le fichier refuse sinon.
--
--  CE QUI EST DÉFAIT (uniquement ce que 0018 a créé ou rempli, d'après private.backup_0018_*) :
--   - recipes.owner_id et recipes.category_id remis à NULL sur les recettes remplies par 0018
--     (updated_at préservé) ; visibility reste 'groups' (valeur par défaut de 0017) ;
--   - recipe_grants, cookbook_entries, categories, group_members et le groupe créés par 0018 supprimés ;
--   - profiles : rôle, display_name, cookbook_title, active_theme_group_id, onboarded_at remis tels
--     qu'avant (le 2ᵉ admin redevient admin) ;
--   - tables de sauvegarde supprimées. `private.v2_fill_params` (e-mails, pseudonymes) est LAISSÉE : à
--     supprimer à la main quand on n'en a plus besoin (drop table private.v2_fill_params).
--
--  ⚠️ À faire AVANT que les gens utilisent la v2 : les catégories, carnets et droits créés ENTRE-TEMPS
--  par la v2 (non listés dans la sauvegarde) ne sont pas supprimés ; une catégorie de 0018 renommée ou
--  utilisée par une recette v2 est supprimée quand même (la recette reperd sa catégorie, `set null`).
--  Rejouable : sans sauvegarde, le fichier ne fait rien (« rien à annuler »).
-- ============================================================================

begin;

do $$
declare
  v_prev text := current_setting('request.jwt.claims', true);
  v_trigger boolean;
  n_cb bigint; n_gr bigint; n_cat bigint; n_rcat bigint; n_rec bigint; n_mem bigint; n_grp bigint; n_prof bigint;
begin
  if to_regclass('private.backup_0018_profiles') is null or to_regclass('private.backup_0018_created') is null then
    raise notice '[0018 down] rien à annuler : pas de sauvegarde (0018 non appliquée, ou déjà annulée)';
    return;
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'recipes' and column_name = 'owner_id' and is_nullable = 'NO')
     or to_regprocedure('private.recipes_guard_owner_fields()') is not null then
    raise exception '[0018 down] retirer d''abord la bascule : rollback/0020_rls_switchover_down.sql';
  end if;

  -- carnets, droits
  delete from public.cookbook_entries ce
   where (ce.user_id::text || ':' || ce.recipe_id::text) in (select ref from private.backup_0018_created where kind = 'cookbook');
  get diagnostics n_cb = row_count;
  delete from public.recipe_grants rg where rg.id::text in (select ref from private.backup_0018_created where kind = 'grant');
  get diagnostics n_gr = row_count;

  -- recettes : propriétaire et catégorie à NULL (updated_at préservé)
  select exists (select 1 from pg_trigger where tgrelid = 'public.recipes'::regclass and tgname = 'update_recipes_updated_at' and not tgisinternal)
    into v_trigger;
  if v_trigger then alter table public.recipes disable trigger update_recipes_updated_at; end if;
  update public.recipes set category_id = null where id::text in (select ref from private.backup_0018_created where kind = 'recipe_category');
  get diagnostics n_rcat = row_count;
  update public.recipes set owner_id = null where id::text in (select ref from private.backup_0018_created where kind = 'recipe_owner');
  get diagnostics n_rec = row_count;
  if v_trigger then alter table public.recipes enable trigger update_recipes_updated_at; end if;

  -- catégories créées
  delete from public.categories where id::text in (select ref from private.backup_0018_created where kind = 'category');
  get diagnostics n_cat = row_count;

  -- membres puis groupe (le déclencheur de départ remet active_theme_group_id à NULL ; les profils sont restaurés ensuite)
  delete from public.group_members gm where (gm.group_id::text || ':' || gm.user_id::text) in (select ref from private.backup_0018_created where kind = 'member');
  get diagnostics n_mem = row_count;
  delete from public.groups where id::text in (select ref from private.backup_0018_created where kind = 'group');
  get diagnostics n_grp = row_count;

  -- profils : mêmes colonnes qu'avant. Rôle : claim local `user_role = admin` pour le déclencheur
  -- anti-escalade (voir 0018, CHOIX n° 5), restauré aussitôt.
  perform set_config('request.jwt.claims', '{"role":"service_role","user_role":"admin"}', true);
  update public.profiles p
     set role = bp.role,
         display_name = bp.display_name,
         cookbook_title = bp.cookbook_title,
         onboarded_at = bp.onboarded_at,
         active_theme_group_id = case when exists (select 1 from public.groups g where g.id = bp.active_theme_group_id)
                                      then bp.active_theme_group_id end
    from private.backup_0018_profiles bp
   where bp.id = p.id;
  get diagnostics n_prof = row_count;
  perform set_config('request.jwt.claims', coalesce(v_prev, ''), true);

  -- contrôles
  assert not exists (select 1 from public.recipes r where r.id::text in (select ref from private.backup_0018_created where kind = 'recipe_owner') and r.owner_id is not null),
    '[0018 down] des recettes gardent un propriétaire';
  assert not exists (select 1 from public.groups g where g.id::text in (select ref from private.backup_0018_created where kind = 'group')),
    '[0018 down] le groupe existe encore';
  assert not exists (select 1 from public.profiles p join private.backup_0018_profiles bp on bp.id = p.id
                      where p.role is distinct from bp.role or p.display_name is distinct from bp.display_name),
    '[0018 down] des profils ne sont pas revenus à leur état d''avant';

  drop table private.backup_0018_created;
  drop table private.backup_0018_profiles;
  raise notice '[0018 down] défait : % recette(s) sans propriétaire, % catégorie(s) de recette remise(s) à NULL, % droit(s), % catégorie(s), % entrée(s) de carnet, % membre(s), % groupe(s) supprimé(s) ; % profil(s) restauré(s) (rôles d''origine). private.v2_fill_params est conservée : la supprimer quand elle ne sert plus.',
    n_rec, n_rcat, n_gr, n_cat, n_cb, n_mem, n_grp, n_prof;
end $$;

notify pgrst, 'reload schema';

commit;
