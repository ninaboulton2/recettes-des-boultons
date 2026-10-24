import { execFileSync } from 'node:child_process'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, type Page } from '@playwright/test'
import { SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY, SUPABASE_URL, assertLocalSupabase } from '../support/env'
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

// ---------------------------------------------------------------------------------------------------------------
// Phase 6C : amis, groupes, notifications
// ---------------------------------------------------------------------------------------------------------------

/** Préfixe des groupes et recettes créés par les parcours 6C (retrouvés et supprimés par `cleanup6C`). */
export const E2E_6C = 'E2E_6C_'

const DB_CONTAINER = process.env.E2E_DB_CONTAINER ?? 'supabase_db_recettes-des-boultons'

/**
 * SQL sur la base LOCALE (conteneur Docker de la stack Supabase, rôle postgres) pour ce que l'API ne permet pas :
 * vider les journaux de limites de débit (`private.rate_events`), les notifications, ou en fabriquer.
 * Refuse net si l'URL Supabase du test n'est pas locale.
 */
export function sqlLocal(statement: string): string {
  assertLocalSupabase()
  return execFileSync('docker', ['exec', DB_CONTAINER, 'psql', '-U', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-c', statement], { encoding: 'utf8' })
}

/** Remet le social à zéro : amitiés, notifications, limites de débit, bannières fermées, groupes `E2E_6C_*`. */
export function cleanup6C(): void {
  sqlLocal(`
    delete from public.friendships;
    delete from public.notifications;
    delete from private.rate_events;
    delete from public.dismissed_prompts;
    delete from public.groups where name like '${E2E_6C}%';
  `)
}

/** Déconnecte puis connecte un autre compte dans la même page (deux personnes à la suite). */
export async function switchTo(page: Page, account: V2Account): Promise<void> {
  await logoutV2(page)
  await loginV2(page, account)
}

/** Crée un groupe `E2E_6C_*` dont `creator` est le créateur ; les `members` y entrent (invitation puis acceptation). Renvoie son id. */
export async function createGroupWith(creator: V2Account, name: string, members: V2Account[] = []): Promise<string> {
  const owner = await signedIn(creator)
  const { data: groupId, error } = await owner.client.rpc('create_group', { p_name: name })
  if (error) throw new Error(`Création du groupe impossible : ${error.message}`)
  for (const member of members) {
    const guest = await signedIn(member)
    const invited = await owner.client.rpc('invite_to_group', { p_group: groupId, p_user: guest.userId })
    if (invited.error) throw new Error(`Invitation impossible : ${invited.error.message}`)
    const answered = await guest.client.rpc('respond_group_invitation', { p_id: invited.data as string, p_accept: true })
    if (answered.error) throw new Error(`Acceptation impossible : ${answered.error.message}`)
    await guest.client.auth.signOut({ scope: 'local' })
  }
  await owner.client.auth.signOut({ scope: 'local' })
  return groupId as string
}

// ---------------------------------------------------------------------------------------------------------------
// Phase 6D / 6E : comptes jetables, réglages, signalements
// ---------------------------------------------------------------------------------------------------------------

/** Préfixe des données créées par les parcours 6D / 6E (groupes, recettes, comptes jetables). */
export const E2E_6D = 'E2E_6D_'
export const E2E_6E = 'E2E_6E_'

export interface Disposable { email: string, userId: string, client: SupabaseClient }

/** Connexion par la modale avec une adresse quelconque (compte jetable). */
export async function loginAs(page: Page, email: string): Promise<void> {
  await page.goto('/')
  await waitForHydration(page)
  await page.getByRole('banner').getByRole('button', { name: 'Connexion' }).click()
  const dialog = page.getByRole('dialog', { name: 'Connexion' })
  await dialog.getByRole('textbox', { name: 'Email' }).fill(email)
  await dialog.getByRole('textbox', { name: 'Mot de passe' }).fill(V2_PASSWORD)
  await dialog.getByRole('button', { name: 'Se connecter' }).click()
  await expect(dialog).toBeHidden()
}

/** Crée un compte jetable ACCUEILLI (pseudonyme + accueil terminé) par l'API d'administration locale. */
export async function createDisposableUser(label: string): Promise<Disposable> {
  assertLocalSupabase()
  if (!SUPABASE_SERVICE_KEY) throw new Error('SUPABASE_SECRET_KEY absente de .env.local (clé service_role LOCALE)')
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const email = `e2e-${label}-${Date.now().toString(36)}@local.test`
  const created = await admin.auth.admin.createUser({ email, password: V2_PASSWORD, email_confirm: true, user_metadata: { name: label } })
  if (created.error || !created.data.user) throw new Error(`Création du compte jetable impossible : ${created.error?.message}`)
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const signed = await client.auth.signInWithPassword({ email, password: V2_PASSWORD })
  if (signed.error) throw new Error(`Connexion du compte jetable impossible : ${signed.error.message}`)
  const profile = await client.rpc('update_my_profile', { p_display_name: `Jetable ${label} ${Date.now().toString(36)}`, p_complete_onboarding: true })
  if (profile.error) throw new Error(`Profil du compte jetable impossible : ${profile.error.message}`)
  return { email, userId: created.data.user.id, client }
}

/** Le compte existe-t-il encore côté Auth ? */
export async function userExists(userId: string): Promise<boolean> {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data } = await admin.auth.admin.getUserById(userId)
  return !!data.user
}

/** Retire les comptes jetables restants et les données 6D / 6E (signalements, recettes, groupes, limites de débit). */
export function cleanup6DE(): void {
  sqlLocal(`
    delete from public.reports;
    delete from public.recipes where title like '${E2E_6E}%';
    delete from public.groups where name like '${E2E_6D}%' or name like '${E2E_6E}%';
    delete from auth.users where email like 'e2e-%@local.test';
    delete from public.notifications;
    delete from private.rate_events;
    delete from public.friendships;
  `)
}
