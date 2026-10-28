import { needsTranslation } from '#shared/utils/translation'
import type { RecipeLang } from '#shared/types'
import { apiFetch } from '~/composables/useApi'

/**
 * Traduction à la demande d'une recette lue dans l'autre langue (recette partagée : lien, personne, groupe, « Explorer »…).
 *
 * Quand la recette affichée n'est pas dans la langue de l'interface alors qu'elle pourrait l'être (`needsTranslation`), on demande au
 * serveur de la traduire (`POST /api/v2/recipes/<id>/translate` ou `/api/v2/shared/<jeton>/translate`). En attendant, la page montre le
 * texte d'origine avec la mention « traduction en cours » (`status = 'pending'`) ; à la réponse, `onTranslated` recharge la recette.
 * Le coût est compté sur l'auteur de la recette (voir `server/utils/sharedTranslationCore.ts`), jamais sur la personne qui lit.
 *
 * Une seule demande par recette et par langue et par session du navigateur (`requested`) : un échec (`status = 'unavailable'`) n'est
 * pas rejoué à chaque affichage. Seule exception : `busy` (la même traduction est déjà en cours chez une autre personne) est réessayée
 * quelques fois. Client seulement : rien n'est lancé pendant le rendu serveur (pas d'écart d'hydratation).
 */
export type OnDemandTranslationStatus = 'idle' | 'pending' | 'unavailable'

interface Options {
  /** Adresse de la route de traduction, ou `null` s'il n'y a rien à demander (pas connecté, recette pas encore chargée). */
  endpoint: () => string | null
  /** Langue d'origine et langue affichée de la recette chargée, ou `null` tant qu'elle n'est pas chargée. */
  shown: () => { lang: RecipeLang, displayLang: RecipeLang } | null
  /** Appelée quand la traduction vient d'être écrite : recharger la recette. */
  onTranslated: () => unknown
}

interface Response { status: 'same-language' | 'ready' | 'translated' | 'busy' | 'unavailable' }

const requested = new Set<string>()
const BUSY_RETRIES = 4
const BUSY_DELAY_MS = 3000

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

export function useOnDemandTranslation(options: Options) {
  const { lang: locale } = useRecipeLocale()
  const status = ref<OnDemandTranslationStatus>('idle')
  let token = 0

  async function request(url: string, key: string, mine: number): Promise<void> {
    status.value = 'pending'
    for (let attempt = 0; attempt <= BUSY_RETRIES; attempt++) {
      let outcome: Response['status'] = 'unavailable'
      try {
        const response = await apiFetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locale: locale.value })
        })
        if (response.ok) outcome = ((await response.json()) as Response).status
      } catch {
        outcome = 'unavailable'
      }
      if (mine !== token) return   // autre recette ou autre langue entre-temps
      if (outcome === 'busy' && attempt < BUSY_RETRIES) {
        await wait(BUSY_DELAY_MS)
        if (mine !== token) return
        continue
      }
      if (outcome === 'translated' || outcome === 'ready') {
        status.value = 'idle'
        await options.onTranslated()
        return
      }
      status.value = outcome === 'same-language' ? 'idle' : 'unavailable'
      if (outcome === 'busy') requested.delete(key)   // une prochaine visite pourra réessayer
      return
    }
  }

  function check(): void {
    if (!import.meta.client) return
    const shown = options.shown()
    const url = options.endpoint()
    if (!shown || !url || !needsTranslation({ recipeLang: shown.lang, displayLang: shown.displayLang, locale: locale.value })) {
      // Rien à demander (autre recette, traduction affichée) : on abandonne une demande en cours et on efface la mention.
      token += 1
      status.value = 'idle'
      return
    }
    const key = `${url}|${locale.value}`
    if (requested.has(key)) return
    requested.add(key)
    token += 1
    void request(url, key, token)
  }

  onMounted(check)
  watch(
    () => [options.endpoint(), options.shown()?.lang, options.shown()?.displayLang, locale.value] as const,
    check
  )

  return { status }
}
