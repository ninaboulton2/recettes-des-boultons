import { getEdition, localize, type EditionConfig, type EditionId, type LocalizedText } from '#shared/editions'

/**
 * Édition du site (`runtimeConfig.public.edition`, variable
 * `NUXT_PUBLIC_EDITION` : `boultons` par défaut, ou `generic`).
 *
 * Les composants lisent `config` (nom, couleurs, images, variante d'accueil…)
 * plutôt que de tester l'identifiant : ajouter une édition = ajouter une
 * configuration dans `shared/editions/`.
 */
export function useEdition() {
  const config: EditionConfig = getEdition(useRuntimeConfig().public.edition)
  // `$i18n` (et non useI18n) : utilisable aussi dans un plugin. Absent
  // (environnement de test sans i18n) : français.
  const { $i18n } = useNuxtApp()

  /** Texte de marque dans la langue courante. */
  const text = (value: LocalizedText): string => localize(value, $i18n?.locale.value)

  return {
    edition: config.id as EditionId,
    config,
    isBoultons: config.id === 'boultons',
    isGeneric: config.id === 'generic',
    /** Nom du site dans la langue courante. */
    siteName: computed(() => text(config.brand.name)),
    /** Phrase d'accroche dans la langue courante. */
    tagline: computed(() => text(config.brand.tagline)),
    text
  }
}
