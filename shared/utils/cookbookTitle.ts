import { cleanCookbookTitle } from './siteName'

/**
 * Titre du carnet par langue (migration 0034, `profiles.cookbook_title_i18n`) : `{ fr?: string, en?: string }`.
 * `profiles.cookbook_title` reste la valeur d'origine : c'est le repli quand la langue demandée n'a pas de titre
 * (pas encore traduit, IA indisponible, colonne absente).
 */
export type TitleLocale = 'fr' | 'en'
export type CookbookTitleI18n = Partial<Record<TitleLocale, string>>

export const TITLE_LOCALES: readonly TitleLocale[] = ['fr', 'en']

export function toTitleLocale(value: unknown): TitleLocale {
  return value === 'en' ? 'en' : 'fr'
}

/** L'autre langue de l'interface (celle dans laquelle on traduit). */
export function otherTitleLocale(locale: TitleLocale): TitleLocale {
  return locale === 'fr' ? 'en' : 'fr'
}

/** Lecture tolérante de la colonne (absente, `null`, mal formée : objet vide). Seules les valeurs texte non vides comptent. */
export function parseTitleI18n(value: unknown): CookbookTitleI18n {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const result: CookbookTitleI18n = {}
  for (const locale of TITLE_LOCALES) {
    const raw = (value as Record<string, unknown>)[locale]
    const clean = typeof raw === 'string' ? cleanCookbookTitle(raw) : null
    if (clean) result[locale] = clean
  }
  return result
}

/** Titre à afficher dans la langue de l'interface : la traduction de cette langue, sinon le titre d'origine, sinon `null`. */
export function localizedCookbookTitle(title: string | null | undefined, i18n: unknown, locale: unknown): string | null {
  return parseTitleI18n(i18n)[toTitleLocale(locale)] ?? cleanCookbookTitle(title)
}
