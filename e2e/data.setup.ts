import { test as setup } from '@playwright/test'
import { RECIPES_PER_PAGE, PAGINATION_CATEGORY } from './support/constants'
import { cleanupE2eData, countRecipesInCategory, createE2eRecipes, signedInClient } from './support/supabase'

/**
 * Données nécessaires aux parcours, indépendamment du jeu de données
 * (snapshot prod en local, seed_test.sql en CI) : au moins deux pages de
 * recettes dans la catégorie testée. Les recettes manquantes sont créées
 * (`E2E_…`, compte admin) et supprimées par data.teardown.ts.
 */
setup('données e2e', async () => {
  // Restes d'une exécution interrompue.
  await cleanupE2eData()

  const { client } = await signedInClient('admin')
  const existing = await countRecipesInCategory(client, PAGINATION_CATEGORY)
  await createE2eRecipes(client, PAGINATION_CATEGORY, RECIPES_PER_PAGE + 1 - existing)
  await client.auth.signOut({ scope: 'local' })
})
