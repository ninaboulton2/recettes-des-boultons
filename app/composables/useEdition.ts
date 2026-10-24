import { getEdition, localize, type EditionConfig, type EditionId, type LocalizedText } from '#shared/editions'
import { isV2Enabled } from '#shared/utils/v2'

/**
 * Édition du site.
 *
 * - v1 (défaut) : `runtimeConfig.public.edition` (`NUXT_PUBLIC_EDITION` : `boultons` ou `generic`), figée.
 * - v2 (`NUXT_PUBLIC_V2=true`) : l'édition découle du THÈME ACTIF de la personne connectée (thème personnel ou
 *   thème d'un de ses groupes, validé par liste blanche : `useThemeStore`). Le préréglage `boultons` redonne
 *   exactement l'édition Boultons ; les autres thèmes reposent sur l'édition générique.
 *
 * Les composants lisent `config` (nom, couleurs, images, variante d'accueil…) plutôt que de tester l'identifiant.
 * `config`, `edition`, `isBoultons` et `isGeneric` sont des accesseurs : en v2, relire `useEdition().config`
 * dans un `computed` suit un changement de thème sans rechargement.
 */
export function useEdition() {
  const runtime = useRuntimeConfig().public
  const staticConfig: EditionConfig = getEdition(runtime.edition)
  const themeStore = isV2Enabled(runtime.v2) ? useThemeStore() : null
  const current = (): EditionConfig => themeStore ? themeStore.resolved.edition : staticConfig
  // `$i18n` (et non useI18n) : utilisable aussi dans un plugin. Absent
  // (environnement de test sans i18n) : français.
  const { $i18n } = useNuxtApp()

  /** Texte de marque dans la langue courante. */
  const text = (value: LocalizedText): string => localize(value, $i18n?.locale.value)

  return {
    get edition(): EditionId { return current().id },
    get config(): EditionConfig { return current() },
    get isBoultons(): boolean { return current().id === 'boultons' },
    get isGeneric(): boolean { return current().id === 'generic' },
    /** Nom du site dans la langue courante. */
    siteName: computed(() => text(current().brand.name)),
    /** Phrase d'accroche dans la langue courante. */
    tagline: computed(() => text(current().brand.tagline)),
    text
  }
}
