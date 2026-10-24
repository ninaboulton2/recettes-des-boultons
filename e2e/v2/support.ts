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
