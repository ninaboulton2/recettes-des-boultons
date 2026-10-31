import { parseTitleI18n, toTitleLocale, type CookbookTitleI18n } from '#shared/utils/cookbookTitle'
import { apiFetch } from './useApi'

export type CookbookTitleTranslationStatus = 'translated' | 'manual' | 'unchanged' | 'cleared' | 'unavailable'

/**
 * Titre du carnet dans les deux langues (migration 0034). Après l'enregistrement du titre (`update_my_profile`), demande au serveur
 * (`POST /api/v2/profile/cookbook-title`) de le traduire dans l'autre langue ou d'enregistrer la saisie manuelle. Ne lève jamais :
 * en cas d'échec réseau ou serveur le titre d'origine reste affiché dans l'autre langue (`status: 'unavailable'`).
 * Met à jour le profil du store `auth` avec le résultat, pour que l'en-tête suive tout de suite.
 */
export function useCookbookTitle() {
  const authStore = useAuthStore()
  const { locale } = useI18n()

  async function saveTranslation(input: { title: string, other?: string, refresh?: boolean }): Promise<{ status: CookbookTitleTranslationStatus, i18n: CookbookTitleI18n }> {
    let status: CookbookTitleTranslationStatus = 'unavailable'
    let i18n: CookbookTitleI18n = {}
    try {
      const response = await apiFetch('/api/v2/profile/cookbook-title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: toTitleLocale(locale.value), title: input.title, other: input.other || undefined, refresh: input.refresh })
      })
      if (response.ok) {
        const body = await response.json() as { status?: CookbookTitleTranslationStatus, i18n?: unknown }
        status = body.status ?? 'unavailable'
        i18n = parseTitleI18n(body.i18n)
        const current = authStore.profile
        if (current) authStore.profile = { ...current, cookbook_title_i18n: Object.keys(i18n).length > 0 ? i18n : null }
      }
    } catch {
      // Réseau coupé : le titre est enregistré, sans traduction
    }
    return { status, i18n }
  }

  return { saveTranslation }
}
