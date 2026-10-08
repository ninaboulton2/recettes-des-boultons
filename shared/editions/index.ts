import { boultonsEdition } from './boultons'
import { genericEdition } from './generic'
import { EDITION_IDS, type EditionConfig, type EditionId, type EditionLocale, type LocalizedText } from './types'

export * from './types'

/** Édition par défaut (variable `NUXT_PUBLIC_EDITION` absente ou inconnue). */
export const DEFAULT_EDITION: EditionId = 'boultons'

/** Registre des éditions. Ajouter une édition : un fichier + une entrée ici. */
export const EDITIONS: Readonly<Record<EditionId, EditionConfig>> = {
  boultons: boultonsEdition,
  generic: genericEdition
}

export function isEditionId(value: unknown): value is EditionId {
  return typeof value === 'string' && (EDITION_IDS as readonly string[]).includes(value)
}

/** Identifiant d'édition normalisé (casse, espaces) ; défaut si inconnu. */
export function resolveEditionId(value: unknown): EditionId {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : value
  return isEditionId(normalized) ? normalized : DEFAULT_EDITION
}

/** Configuration d'une édition (valeur de `runtimeConfig.public.edition`). */
export function getEdition(value: unknown): EditionConfig {
  return EDITIONS[resolveEditionId(value)]
}

/** Texte de marque dans la langue demandée (repli : français). */
export function localize(text: LocalizedText, locale: string | undefined): string {
  return text[(locale === 'en' ? 'en' : 'fr') satisfies EditionLocale]
}
