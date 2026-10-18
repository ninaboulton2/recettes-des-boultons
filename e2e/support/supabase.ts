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

/**
 * Crée une recette jetable `E2E_…` avec des étapes dont certaines contiennent une
 * durée (minuteurs du mode cuisine) et renvoie son identifiant. Supprimée par
 * `deleteE2eRecipe` ou par le nettoyage global (cascade sur sections et étapes).
 */
export async function createE2eTimedRecipe(admin: SupabaseClient, title: string, steps: string[]): Promise<string> {
  const base = { title, category: 'plats', description: 'Recette jetable des tests de minuteurs.' }
  let recipe = await admin.from('recipes').insert({ ...base, ingredients: [], instructions: [] }).select('id').single()
  if (recipe.error) recipe = await admin.from('recipes').insert(base).select('id').single()
  const recipeId = (check(recipe, 'Création de la recette E2E') as { id: string }).id
  const section = check(
    await admin.from('recipe_sections').insert({ recipe_id: recipeId, name: 'Préparation', type: 'instructions', order_index: 1 }).select('id').single(),
    'Création de la section E2E'
  ) as { id: string }
  check(
    await admin.from('instructions').insert(steps.map((content, index) => ({ recipe_id: recipeId, section_id: section.id, content, order_index: index + 1 }))),
    'Création des étapes E2E'
  )
  return recipeId
}

export async function deleteE2eRecipe(admin: SupabaseClient, recipeId: string): Promise<void> {
  check(await admin.from('recipes').delete().eq('id', recipeId), 'Suppression de la recette E2E')
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

/**
 * Crée une recette jetable `E2E_…` déjà bilingue (texte français + traduction
 * anglaise « [EN] … », comme le fournisseur IA simulé) en une transaction
 * (`save_recipe` avec `lang` et `translation`). `translated: false` : recette
 * seule, sans traduction (comme les recettes existantes avant 0016).
 */
export async function createE2eBilingualRecipe(
  admin: SupabaseClient,
  title: string,
  options: { translated?: boolean } = {}
): Promise<string> {
  const translated = options.translated ?? true
  const translation = {
    title: `[EN] ${title}`,
    description: '[EN] A disposable marmalade recipe.',
    notes: null,
    tags: [],
    source_hash: 'e2e',
    model: 'e2e',
    content: {
      sections: [
        {
          name: '[EN] Pâte',
          ingredients: [
            { name: '[EN] farine', amount: null, unit: null },
            { name: '[EN] huile', amount: null, unit: null },
            { name: '[EN] sel', amount: '[EN] au goût', unit: null }
          ],
          instructions: []
        },
        { name: '[EN] Préparation', ingredients: [], instructions: ['[EN] Mélanger.', '[EN] Cuire.'] }
      ]
    }
  }
  const payload = {
    title,
    category: 'plats',
    description: 'Une recette jetable de confiture.',
    servings: 4,
    tags: [],
    lang: 'fr',
    sections: [
      {
        name: 'Pâte',
        type: 'ingredients',
        order_index: 0,
        ingredients: [
          { name: 'farine', amount: '200', unit: 'g', order_index: 0 },
          { name: 'huile', amount: '2', unit_code: 'cas', order_index: 1 },
          { name: 'sel', amount: 'au goût', order_index: 2 }
        ],
        instructions: []
      },
      {
        name: 'Préparation',
        type: 'instructions',
        order_index: 1,
        ingredients: [],
        instructions: [{ content: 'Mélanger.', order_index: 0 }, { content: 'Cuire.', order_index: 1 }]
      }
    ],
    ...(translated ? { translation } : {})
  }
  return check(await admin.rpc('save_recipe', { payload }), 'Création de la recette bilingue E2E') as string
}

/** État des traductions avant un test qui en crée beaucoup (page « Traductions »). */
export interface TranslationsSnapshot {
  translated: Set<string>
  langs: Map<string, string>
}

export async function snapshotTranslations(admin: SupabaseClient): Promise<TranslationsSnapshot> {
  const translations = check(await admin.from('recipe_translations').select('recipe_id'), 'Lecture des traductions') as Array<{ recipe_id: string }>
  const recipes = check(await admin.from('recipes').select('id, lang').range(0, 999), 'Lecture des langues') as Array<{ id: string, lang: string }>
  return { translated: new Set(translations.map(row => row.recipe_id)), langs: new Map(recipes.map(row => [row.id, row.lang])) }
}

/**
 * Remet les traductions et les langues dans l'état du `snapshot` : les tests de
 * la page « Traductions » traduisent TOUTES les recettes de la base (avec le
 * fournisseur simulé) ; la base locale (vraies recettes) n'en garde pas de trace.
 */
export async function restoreTranslations(admin: SupabaseClient, snapshot: TranslationsSnapshot): Promise<void> {
  const rows = check(await admin.from('recipe_translations').select('recipe_id'), 'Lecture des traductions') as Array<{ recipe_id: string }>
  const added = rows.map(row => row.recipe_id).filter(id => !snapshot.translated.has(id))
  for (let index = 0; index < added.length; index += 50) {
    check(await admin.from('recipe_translations').delete().in('recipe_id', added.slice(index, index + 50)), 'Suppression des traductions de test')
  }
  const recipes = check(await admin.from('recipes').select('id, lang').range(0, 999), 'Lecture des langues') as Array<{ id: string, lang: string }>
  for (const lang of ['fr', 'en']) {
    const changed = recipes.filter(recipe => snapshot.langs.has(recipe.id) && recipe.lang !== snapshot.langs.get(recipe.id) && snapshot.langs.get(recipe.id) === lang).map(recipe => recipe.id)
    for (let index = 0; index < changed.length; index += 50) {
      check(await admin.from('recipes').update({ lang }).in('id', changed.slice(index, index + 50)), 'Restauration des langues')
    }
  }
}
