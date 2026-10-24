import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '#shared/types/database'
import {
  canCopy,
  canEditOriginal,
  sharedRecipePath,
  toAuthorRecipe,
  toCookbookRecipe,
  toPendingPrompt,
  toRecipeGrant,
  toRecipePermission,
  toSharedWithMeRecipe
} from '#shared/utils/cookbook'
import {
  addToCookbook,
  copyRecipe,
  dismissPrompt,
  listAuthorRecipes,
  listCookbook,
  listSharedWithMe,
  parseClientInput,
  pendingPrompts,
  removeFromCookbook
} from '../../app/composables/useCookbook'
import {
  claimSharedRecipe,
  createShareLink,
  getSharedRecipe,
  grantRecipe,
  listRecipeGrants,
  recipeUsage,
  reshareRecipe,
  revokeRecipeGrant,
  revokeShareLink
} from '../../app/composables/useSharing'
import { grantRecipeInputSchema } from '#shared/schemas/sharing'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

const card = {
  id: A, title: 'Tarte', description: null, category: 'desserts', prep_time: 10, cook_time: null, servings: 4,
  photo_path: null, notes: null, tags: ['fruit'], created_at: '2026-10-24T10:00:00Z', updated_at: '2026-10-24T10:00:00Z',
  lang: 'fr', translation: { locale: 'en', title: 'Pie', description: null, notes: null, tags: [] }
}

/** Faux client : `rpc(name, args)` renvoie la réponse programmée et mémorise l'appel. */
function fakeClient(response: { data?: unknown, error?: unknown }) {
  const rpc = vi.fn(async () => ({ data: response.data ?? null, error: response.error ?? null }))
  return { client: { rpc } as unknown as SupabaseClient<Database>, rpc }
}

describe('conversions snake_case → camelCase', () => {
  it('toRecipePermission : valeur inconnue = read (le plus restrictif)', () => {
    expect(toRecipePermission('author')).toBe('author')
    expect(toRecipePermission('edit_original')).toBe('edit_original')
    expect(toRecipePermission('admin')).toBe('read')
    expect(toRecipePermission(null)).toBe('read')
    expect(canCopy('read')).toBe(false)
    expect(canCopy('copy')).toBe(true)
    expect(canEditOriginal('copy')).toBe(false)
    expect(canEditOriginal('edit_original')).toBe(true)
    expect(canEditOriginal('author')).toBe(true)
  })

  it('toCookbookRecipe : carte + relation, droit, catégorie, auteur, traduction', () => {
    const recipe = toCookbookRecipe({ ...card, category_id: B, relation: 'added', permission: 'copy', author_id: A, author_name: 'Nina', added_at: '2026-10-25T00:00:00Z' })
    expect(recipe).toMatchObject({ id: A, title: 'Tarte', relation: 'added', permission: 'copy', categoryId: B, authorId: A, authorName: 'Nina', addedAt: '2026-10-25T00:00:00Z', lang: 'fr' })
    expect(recipe.translation).toMatchObject({ locale: 'en', title: 'Pie' })
    expect(toCookbookRecipe({ ...card, category_id: null, relation: 'bizarre', permission: 'author', author_id: null, author_name: null, added_at: null }).relation).toBe('owned')
  })

  it('toAuthorRecipe / toSharedWithMeRecipe', () => {
    expect(toAuthorRecipe({ ...card, permission: 'read', in_cookbook: true, author_id: A, author_name: null })).toMatchObject({ permission: 'read', inCookbook: true, authorName: null })
    expect(toSharedWithMeRecipe({ ...card, permission: 'copy', via: 'user', author_id: A, author_name: 'Nina' })).toMatchObject({ via: 'user' })
    expect(toSharedWithMeRecipe({ ...card, permission: 'copy', via: 'autre', author_id: A, author_name: 'Nina' }).via).toBe('group')
  })

  it('toPendingPrompt / toRecipeGrant / sharedRecipePath', () => {
    expect(toPendingPrompt({ kind: 'new_recipe', target_id: B, author_id: A, author_name: 'Nina', recipe_count: 1, recipe_id: B, title: 'Tarte', created_at: 'x' }))
      .toEqual({ kind: 'new_recipe', targetId: B, authorId: A, authorName: 'Nina', recipeCount: 1, recipeId: B, title: 'Tarte', createdAt: 'x' })
    expect(toPendingPrompt({ kind: 'autre', target_id: A, author_id: A, author_name: null, recipe_count: 7, recipe_id: null, title: null, created_at: 'x' }).kind).toBe('author_recipes')
    expect(toRecipeGrant({ grant_id: A, grantee_user_id: B, grantee_group_id: null, grantee_name: 'Eve', permission: 'copy', origin: 'reshare', source_grant_id: B, granted_by: A, granted_by_name: 'Nina', created_at: 'x' }))
      .toMatchObject({ id: A, granteeName: 'Eve', permission: 'copy', origin: 'reshare', sourceGrantId: B })
    expect(toRecipeGrant({ grant_id: A, grantee_user_id: null, grantee_group_id: B, grantee_name: null, permission: 'zzz', origin: 'zzz', source_grant_id: null, granted_by: A, granted_by_name: null, created_at: 'x' }))
      .toMatchObject({ permission: 'read', origin: 'direct' })
    expect(sharedRecipePath(A)).toBe(`/r/${A}`)
  })
})

describe('fonctions du carnet (RPC)', () => {
  it('listCookbook : page → limite / décalage, filtres, total_count', async () => {
    const { client, rpc } = fakeClient({ data: [{ ...card, category_id: null, relation: 'owned', permission: 'author', author_id: A, author_name: 'Nina', added_at: null, total_count: 31 }] })
    const page = await listCookbook(client, { categoryId: B, query: ' tarte ', page: 3, pageSize: 10 })
    expect(rpc).toHaveBeenCalledWith('list_cookbook', { p_category: B, p_query: 'tarte', p_limit: 10, p_offset: 20 })
    expect(page.totalCount).toBe(31)
    expect(page.items[0]?.relation).toBe('owned')
    await listCookbook(client)
    expect(rpc).toHaveBeenLastCalledWith('list_cookbook', { p_category: undefined, p_query: undefined, p_limit: 24, p_offset: 0 })
  })

  it('listAuthorRecipes / listSharedWithMe', async () => {
    const { client, rpc } = fakeClient({ data: [{ ...card, permission: 'read', in_cookbook: false, author_id: A, author_name: 'Nina', total_count: 1 }] })
    expect((await listAuthorRecipes(client, { authorId: A })).items[0]?.inCookbook).toBe(false)
    expect(rpc).toHaveBeenLastCalledWith('list_author_recipes', { p_author: A, p_limit: 24, p_offset: 0 })
    await listSharedWithMe(client, { page: 2 })
    expect(rpc).toHaveBeenLastCalledWith('list_shared_with_me', { p_limit: 24, p_offset: 24 })
  })

  it('ajout / retrait / copie renvoient la valeur de la base', async () => {
    expect(await addToCookbook(fakeClient({ data: true }).client, { recipeId: A })).toBe(true)
    expect(await addToCookbook(fakeClient({ data: false }).client, { recipeId: A, categoryId: B })).toBe(false)
    expect(await removeFromCookbook(fakeClient({ data: true }).client, { recipeId: A })).toBe(true)
    const { client, rpc } = fakeClient({ data: B })
    expect(await copyRecipe(client, { recipeId: A })).toBe(B)
    expect(rpc).toHaveBeenCalledWith('copy_recipe', { p_source: A })
  })

  it('une erreur de base est relancée telle quelle ; une entrée invalide n\'appelle jamais la base', async () => {
    const dbError = { code: '42501', message: 'Copie impossible' }
    await expect(copyRecipe(fakeClient({ error: dbError }).client, { recipeId: A })).rejects.toBe(dbError)
    const { client, rpc } = fakeClient({ data: true })
    await expect(addToCookbook(client, { recipeId: 'pas-un-uuid' })).rejects.toThrow(/Données invalides : recipeId/)
    await expect(copyRecipe(client, {} as never)).rejects.toThrow(/Données invalides/)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('bannières : pendingPrompts et dismissPrompt', async () => {
    const { client, rpc } = fakeClient({ data: [{ kind: 'author_recipes', target_id: A, author_id: A, author_name: 'Nina', recipe_count: 7, recipe_id: null, title: null, created_at: 'x' }] })
    const prompts = await pendingPrompts(client, { since: '2026-10-24T10:00:00Z', limit: 5 })
    expect(prompts[0]).toMatchObject({ kind: 'author_recipes', recipeCount: 7 })
    expect(rpc).toHaveBeenCalledWith('pending_prompts', { p_since: '2026-10-24T10:00:00Z', p_limit: 5 })
    await dismissPrompt(client, { kind: 'new_recipe', targetId: B })
    expect(rpc).toHaveBeenLastCalledWith('dismiss_prompt', { p_kind: 'new_recipe', p_target: B })
    await expect(dismissPrompt(client, { kind: 'x' as never, targetId: B })).rejects.toThrow(/Données invalides/)
  })

  it('parseClientInput : message français avec le chemin du champ', () => {
    expect(() => parseClientInput(grantRecipeInputSchema, { recipeId: A })).toThrow(/indiquez une personne OU un groupe/)
    expect(parseClientInput(grantRecipeInputSchema, { recipeId: A, granteeUserId: B }).permission).toBe('copy')
  })
})

describe('fonctions de partage (RPC)', () => {
  it('grantRecipe / reshareRecipe : arguments RPC, repartage jamais edit_original', async () => {
    const { client, rpc } = fakeClient({ data: B })
    expect(await grantRecipe(client, { recipeId: A, granteeUserId: B, permission: 'edit_original' })).toBe(B)
    expect(rpc).toHaveBeenLastCalledWith('grant_recipe', { p_recipe: A, p_grantee_user: B, p_grantee_group: undefined, p_permission: 'edit_original' })
    expect(await reshareRecipe(client, { recipeId: A, granteeGroupId: B })).toBe(B)
    expect(rpc).toHaveBeenLastCalledWith('reshare_recipe', { p_recipe: A, p_grantee_user: undefined, p_grantee_group: B, p_permission: 'read' })
    rpc.mockClear()
    await expect(reshareRecipe(client, { recipeId: A, granteeUserId: B, permission: 'edit_original' as never })).rejects.toThrow(/jamais edit_original/)
    expect(rpc).not.toHaveBeenCalled()
    expect(await reshareRecipe(fakeClient({ data: null }).client, { recipeId: A, granteeUserId: B })).toBeNull()
  })

  it('revokeRecipeGrant, listRecipeGrants, recipeUsage', async () => {
    expect(await revokeRecipeGrant(fakeClient({ data: true }).client, { grantId: A })).toBe(true)
    expect(await revokeRecipeGrant(fakeClient({ data: false }).client, { grantId: A })).toBe(false)
    const grants = await listRecipeGrants(fakeClient({ data: [{ grant_id: A, grantee_user_id: B, grantee_group_id: null, grantee_name: 'Eve', permission: 'copy', origin: 'direct', source_grant_id: null, granted_by: A, granted_by_name: 'Nina', created_at: 'x' }] }).client, { recipeId: A })
    expect(grants[0]).toMatchObject({ id: A, granteeName: 'Eve' })
    expect(await recipeUsage(fakeClient({ data: [{ cookbook_count: 3, copy_count: 1 }] }).client, { recipeId: A })).toEqual({ cookbookCount: 3, copyCount: 1 })
    expect(await recipeUsage(fakeClient({ data: [] }).client, { recipeId: A })).toEqual({ cookbookCount: 0, copyCount: 0 })
  })

  it('lien public : create / revoke / claim', async () => {
    expect(await createShareLink(fakeClient({ data: B }).client, { recipeId: A })).toEqual({ token: B, path: `/r/${B}` })
    expect(await revokeShareLink(fakeClient({ data: false }).client, { recipeId: A })).toBe(false)
    const { client, rpc } = fakeClient({ data: A })
    expect(await claimSharedRecipe(client, { token: B })).toBe(A)
    expect(rpc).toHaveBeenCalledWith('claim_shared_recipe', { p_token: B })
  })

  it('getSharedRecipe : NULL = lien inconnu ; réponse validée strictement', async () => {
    expect(await getSharedRecipe(fakeClient({ data: null }).client, { token: A })).toBeNull()
    const ok = {
      title: 'Tarte', description: null, category: 'desserts', prep_time: null, cook_time: null, servings: 4, tags: [], notes: null,
      lang: 'fr', has_photo: false, author_name: 'Nina', sections: [], translation: null
    }
    const { client, rpc } = fakeClient({ data: ok })
    expect((await getSharedRecipe(client, { token: A, locale: 'en' }))?.title).toBe('Tarte')
    expect(rpc).toHaveBeenCalledWith('get_shared_recipe', { p_token: A, p_locale: 'en' })
    await expect(getSharedRecipe(fakeClient({ data: { ...ok, owner_id: B } }).client, { token: A })).rejects.toThrow(/Données invalides/)
  })
})
