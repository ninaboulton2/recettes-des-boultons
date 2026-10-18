import { defineEventHandler } from 'h3'
import type { TranslationStatus } from '#shared/schemas'
import { loadTranslationStatus } from '../../utils/translations'

/**
 * GET /api/translations — état des traductions des recettes (admin) :
 * traduites / périmées / manquantes, appels IA et coût cumulé
 * (`ai_usage`, `translate_recipe`), coût estimé de ce qui reste, quota
 * journalier. Alimente la page « Traductions ».
 */
export default defineEventHandler(async (event): Promise<{ success: true, status: TranslationStatus }> => {
  try {
    const { supabase } = await requireAdmin(event)
    return { success: true, status: await loadTranslationStatus(event, supabase) }
  } catch (error: unknown) {
    handleApiError(error, 'translations.get')
  }
})
