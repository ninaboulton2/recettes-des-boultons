/**
 * Pages légales (phase 6E) : contenu structuré, une version par langue (`fr.ts`, `en.ts`), rendu par `LegalPage.vue`.
 * Choix d'un contenu en TypeScript plutôt que dans les fichiers i18n : de longs textes avec listes et liens y seraient illisibles ;
 * la parité FR / EN (mêmes pages, mêmes sections, mêmes blocs) est vérifiée par `test/unit/legal.test.ts`.
 */
export type LegalPageId = 'mentions' | 'privacy' | 'terms' | 'cookies'

export type LegalBlock =
  | { type: 'p', text: string }
  | { type: 'ul', items: string[] }
  /** Ligne de contact : l'adresse configurée (`NUXT_PUBLIC_CONTACT_EMAIL`) en lien, sinon le texte de repli de la langue. */
  | { type: 'contact' }
  /** Lien externe : `label` (texte) et `href` (https). */
  | { type: 'link', label: string, href: string }

export interface LegalSection {
  id: string
  title: string
  blocks: LegalBlock[]
}

export interface LegalDocument {
  title: string
  /** Phrase d'introduction sous le titre. */
  intro: string
  sections: LegalSection[]
}

export interface LegalTexts {
  /** Texte de repli du bloc `contact` quand aucune adresse n'est configurée. */
  contactFallback: string
  /** Libellé devant l'adresse configurée. */
  contactLabel: string
  /** « Dernière mise à jour » : date ISO de la version des textes. */
  updatedLabel: string
  pages: Record<LegalPageId, LegalDocument>
}

/** Date de la version des textes (à changer à chaque modification de fond). */
export const LEGAL_UPDATED = '2026-10-24'

export const LEGAL_PATHS: Record<LegalPageId, string> = {
  mentions: '/mentions-legales',
  privacy: '/confidentialite',
  terms: '/conditions',
  cookies: '/cookies'
}
export const LEGAL_PAGE_IDS = Object.keys(LEGAL_PATHS) as LegalPageId[]

/** Adresse de contact valide ? (variable `NUXT_PUBLIC_CONTACT_EMAIL` ; vide ou mal formée = absente). */
export function normalizeContactEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const email = value.trim()
  return /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/.test(email) ? email : null
}
