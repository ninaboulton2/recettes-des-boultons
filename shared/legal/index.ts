import { buildLegalEn, legalEn } from './en'
import { buildLegalFr, legalFr } from './fr'
import type { LegalTexts } from './types'

export * from './types'

/** Textes légaux dans la langue demandée (français par défaut). */
export function legalTexts(locale: string, googleAuth = true): LegalTexts {
  if (googleAuth) return locale === 'en' ? legalEn : legalFr
  return locale === 'en' ? buildLegalEn(false) : buildLegalFr(false)
}
