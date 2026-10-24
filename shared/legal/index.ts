import { legalEn } from './en'
import { legalFr } from './fr'
import type { LegalTexts } from './types'

export * from './types'

/** Textes légaux dans la langue demandée (français par défaut). */
export function legalTexts(locale: string): LegalTexts {
  return locale === 'en' ? legalEn : legalFr
}
