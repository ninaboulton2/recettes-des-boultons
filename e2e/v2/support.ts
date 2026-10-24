import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, type Page } from '@playwright/test'
import { SUPABASE_ANON_KEY, SUPABASE_URL, assertLocalSupabase } from '../support/env'
import { waitForHydration } from '../support/app'

/** Comptes créés par supabase/local/setup_v2.sh (mot de passe commun). */
export const V2_ACCOUNTS = {
  nouveau: 'nouveau@local.test',
  ami: 'ami@local.test',
  user: 'user@local.test',
  admin: 'admin@local.test'
} as const
export type V2Account = keyof typeof V2_ACCOUNTS
export const V2_PASSWORD = 'password123'

export async function signedIn(account: V2Account): Promise<{ client: SupabaseClient, userId: string }> {
  assertLocalSupabase()
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.auth.signInWithPassword({ email: V2_ACCOUNTS[account], password: V2_PASSWORD })
  if (error || !data.user) throw new Error(`Connexion ${V2_ACCOUNTS[account]} impossible : ${error?.message}`)
  return { client, userId: data.user.id }
}

/** Connexion par la modale de l'app (bouton « Connexion » de l'en-tête). */
export async function loginV2(page: Page, account: V2Account): Promise<void> {
  await page.goto('/')
  await waitForHydration(page)
  await page.getByRole('banner').getByRole('button', { name: 'Connexion' }).click()
  const dialog = page.getByRole('dialog', { name: 'Connexion' })
  await dialog.getByRole('textbox', { name: 'Email' }).fill(V2_ACCOUNTS[account])
  await dialog.getByRole('textbox', { name: 'Mot de passe' }).fill(V2_PASSWORD)
  await dialog.getByRole('button', { name: 'Se connecter' }).click()
  await expect(dialog).toBeHidden()
}

export const cssVar = (page: Page, name: string) =>
  page.evaluate(variable => getComputedStyle(document.documentElement).getPropertyValue(variable).trim(), name)

/** Remet nouveau@local.test dans l'état « compte neuf » (profil et catégories). */
export async function resetNewcomer(): Promise<void> {
  const { client, userId } = await signedIn('nouveau')
  const update = await client.from('profiles').update({
    display_name: null, cookbook_title: null, theme_settings: null, active_theme_group_id: null, onboarded_at: null
  }).eq('id', userId)
  if (update.error) throw new Error(update.error.message)
  const del = await client.from('categories').delete().eq('owner_id', userId)
  if (del.error) throw new Error(del.error.message)
  await client.auth.signOut({ scope: 'local' })
}

// ---------------------------------------------------------------------------------------------------------------
// Phase 6B : recettes, amitiés et nettoyage
// ---------------------------------------------------------------------------------------------------------------

/** Préfixe de toutes les recettes créées par les parcours 6B (retrouvées et supprimées par `cleanup6B`). */
export const E2E_6B = 'E2E_6B_'

/** Crée une recette complète (un ingrédient, une étape) pour le compte connecté ; renvoie son identifiant. */
export async function createRecipe(client: SupabaseClient, title: string, visibility: 'private' | 'groups' = 'groups'): Promise<string> {
  const { data, error } = await client.rpc('save_recipe', {
    payload: {
      title,
      category: 'plats',
      visibility,
      servings: 4,
      sections: [
        { name: '', type: 'ingredients', order_index: 0, ingredients: [{ name: 'farine', amount: '200', unit: 'g', order_index: 0 }], instructions: [] },
        { name: '', type: 'instructions', order_index: 1, ingredients: [], instructions: [{ content: 'Mélanger puis cuire 20 minutes.', order_index: 0 }] }
      ]
    }
  })
  if (error || typeof data !== 'string') throw new Error(`Création de « ${title} » impossible : ${error?.message}`)
  return data
}

/** Supprime les recettes `E2E_6B_*` du compte connecté (les siennes seulement : le RLS) et ses entrées de carnet. */
export async function deleteOwnRecipes(client: SupabaseClient): Promise<void> {
  await client.from('recipes').delete().like('title', `${E2E_6B}%`)
}

/** Retire les restes d'un parcours : recettes E2E_6B_ de chaque compte, bannières fermées de `user`. */
export async function cleanup6B(): Promise<void> {
  for (const account of ['admin', 'user', 'ami'] as const) {
    const { client, userId } = await signedIn(account)
    await client.from('cookbook_entries').delete().eq('user_id', userId)
    await deleteOwnRecipes(client)
    await client.from('dismissed_prompts').delete().eq('user_id', userId)
    await client.auth.signOut({ scope: 'local' })
  }
}

/** Donne un pseudonyme à `ami@` et termine son accueil (sinon toute page l'envoie sur /onboarding) ; `restoreAmi` le remet en l'état. */
export async function prepareAmi(): Promise<string> {
  const { client, userId } = await signedIn('ami')
  const { error } = await client.rpc('update_my_profile', { p_display_name: 'Ami E2E', p_complete_onboarding: true })
  if (error) throw new Error(`Préparation de ami@ impossible : ${error.message}`)
  await client.auth.signOut({ scope: 'local' })
  return userId
}

export async function restoreAmi(): Promise<void> {
  const { client, userId } = await signedIn('ami')
  await client.from('profiles').update({ display_name: null, onboarded_at: null }).eq('id', userId)
  await client.auth.signOut({ scope: 'local' })
}

/** Rend deux comptes amis (demande puis acceptation) ; `removeFriendship` y met fin. */
export async function makeFriends(a: V2Account = 'admin', b: V2Account = 'ami'): Promise<void> {
  const first = await signedIn(a)
  const second = await signedIn(b)
  const { data: id, error } = await first.client.rpc('send_friend_request', { p_user: second.userId })
  if (error) throw new Error(`Demande d'ami impossible : ${error.message}`)
  const answered = await second.client.rpc('respond_friend_request', { p_id: id as string, p_accept: true })
  if (answered.error) throw new Error(`Acceptation impossible : ${answered.error.message}`)
  await first.client.auth.signOut({ scope: 'local' })
  await second.client.auth.signOut({ scope: 'local' })
}

export async function removeFriendship(a: V2Account = 'admin', b: V2Account = 'ami'): Promise<void> {
  const first = await signedIn(a)
  const second = await signedIn(b)
  await first.client.rpc('remove_friend', { p_user: second.userId })
  await first.client.auth.signOut({ scope: 'local' })
  await second.client.auth.signOut({ scope: 'local' })
}

/** Déconnexion par l'interface (menu de la personne). */
export async function logoutV2(page: Page): Promise<void> {
  await page.context().clearCookies()
  await page.evaluate(() => { try { localStorage.clear() } catch { /* sans stockage */ } })
}
