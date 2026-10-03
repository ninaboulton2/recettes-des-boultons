import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ACCOUNTS, E2E_PREFIX, type AccountRole } from './accounts'
import { SUPABASE_ANON_KEY, SUPABASE_URL, assertLocalSupabase } from './env'

/**
 * Client Supabase (Node) connecté avec un compte de test : préparation et
 * nettoyage des données sous RLS, exactement comme l'app (pas de clé
 * service_role). Volontairement non typé : indépendant de
 * shared/types/database.ts.
 *
 * Fermeture : `signOut({ scope: 'local' })` UNIQUEMENT — la portée par défaut
 * (`global`) révoquerait aussi les sessions du navigateur enregistrées par
 * auth.setup.ts.
 */
export async function signedInClient(role: AccountRole): Promise<{ client: SupabaseClient, userId: string }> {
  assertLocalSupabase()
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
  const { data, error } = await client.auth.signInWithPassword(ACCOUNTS[role])
  if (error || !data.user) throw new Error(`Connexion ${ACCOUNTS[role].email} impossible : ${error?.message}`)
  return { client, userId: data.user.id }
}

function check<T>(result: { data: T, error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what} : ${result.error.message}`)
  return result.data
}

/** Recettes dont le titre commence par `prefix` (lecture publique). */
export async function findRecipes(client: SupabaseClient, titlePrefix: string): Promise<{ id: string, title: string }[]> {
  return check(await client.from('recipes').select('id, title').ilike('title', `${titlePrefix}%`).order('title'), 'Lecture des recettes') ?? []
}

export async function countRecipesInCategory(client: SupabaseClient, category: string): Promise<number> {
  const { count, error } = await client.from('recipes').select('id', { count: 'exact', head: true }).eq('category', category)
  if (error) throw new Error(`Comptage des recettes : ${error.message}`)
  return count ?? 0
}

/**
 * Crée des recettes jetables `E2E_…` (compte admin, politique RLS
 * recipes_admin_insert). Les colonnes JSONB historiques sont renseignées si
 * elles existent encore (le schéma évolue : repli sans elles).
 */
export async function createE2eRecipes(admin: SupabaseClient, category: string, count: number): Promise<void> {
  if (count <= 0) return
  const rows = Array.from({ length: count }, (_, index) => ({
    title: `${E2E_PREFIX}Recette ${String(index + 1).padStart(2, '0')}`,
    category,
    description: 'Recette jetable des tests de bout en bout.'
  }))
  const withLegacy = await admin.from('recipes').insert(rows.map(row => ({ ...row, ingredients: [], instructions: [] })))
  if (!withLegacy.error) return
  check(await admin.from('recipes').insert(rows), 'Création des recettes E2E')
}

/** Motif LIKE du préfixe (le `_` est échappé : sinon joker d'un caractère). */
const E2E_LIKE = `${E2E_PREFIX.replace(/_/g, '\\_')}%`

/** Supprime tout ce que les tests ont pu laisser (préfixe `E2E_`). */
export async function cleanupE2eData(): Promise<void> {
  for (const role of ['user', 'admin'] as const) {
    const { client, userId } = await signedInClient(role)
    check(await client.from('shopping_lists').delete().eq('user_id', userId).like('name', E2E_LIKE), 'Nettoyage des listes')
    check(await client.from('planning').delete().eq('user_id', userId).like('custom_title', E2E_LIKE), 'Nettoyage du planning')
    if (role === 'admin') {
      check(await client.from('recipes').delete().like('title', E2E_LIKE), 'Nettoyage des recettes')
    }
    await client.auth.signOut({ scope: 'local' })
  }
}
