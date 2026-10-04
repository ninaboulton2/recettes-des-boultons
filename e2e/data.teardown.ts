import { test as teardown } from '@playwright/test'
import { cleanupE2eData } from './support/supabase'

/** Suppression de toutes les données `E2E_…` (listes, planning, recettes). */
teardown('nettoyage e2e', async () => {
  await cleanupE2eData()
})
