import { EDITIONS, getEdition, localize, type EditionConfig } from '../../shared/editions'
import { HEX_COLOR_PATTERN } from '../../shared/themes/schema'
import { DEFAULT_THEME, resolveTheme } from '../../shared/themes'

/**
 * Manifeste PWA (`/manifest.webmanifest`, DEVELOPER.md § 20.18).
 *
 * - v1 : le manifeste de l'édition (`NUXT_PUBLIC_EDITION`), identique à l'ancien manifeste figé au build.
 * - v2 : celui du THÈME ACTIF de la personne connectée (thème personnel ou d'un de ses groupes), visiteur : thème par défaut.
 *   Le thème est une entrée non fiable : il passe par `resolveTheme` (liste blanche) ; le nom n'est que du texte JSON.
 *
 * Icônes : cocotte pour le préréglage Boultons, toque terracotta pour le thème par défaut, toque SVG à la couleur du thème pour
 * les autres (`/pwa-icon.svg`, couleur validée `#rrggbb`).
 */

export interface WebManifest {
  name: string
  short_name: string
  description: string
  lang: string
  start_url: string
  scope: string
  display: string
  theme_color: string
  background_color: string
  icons: Array<{ src: string, sizes: string, type: string, purpose?: string }>
}

/** Nom court : celui du préréglage s'il n'a pas été renommé, sinon le nom personnalisé raccourci (12 caractères au plus, au mot). */
export function shortNameFor(edition: EditionConfig): string {
  const base = EDITIONS[edition.id]
  if (edition.brand.name.fr === base.brand.name.fr) return base.brand.shortName
  const name = edition.brand.name.fr
  if (name.length <= 12) return name
  const cut = name.slice(0, 12)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace >= 4 ? cut.slice(0, lastSpace) : cut).trim()
}

/** Adresse de l'icône SVG colorée (`maskable` : fond plein cadre). `null` si la couleur n'est pas un `#rrggbb`. */
export function coloredIconUrl(color: string, maskable: boolean): string | null {
  if (!HEX_COLOR_PATTERN.test(color)) return null
  return `/pwa-icon.svg?c=${color.slice(1).toLowerCase()}${maskable ? '&m=1' : ''}`
}

export function buildManifest(edition: EditionConfig): WebManifest {
  const { brand, theme } = edition
  const defaultColor = EDITIONS.generic.theme.themeColor.light
  const useStaticIcons = edition.id === 'boultons' || theme.themeColor.light === defaultColor
  const anyIcon = coloredIconUrl(theme.themeColor.light, false)
  const maskableIcon = coloredIconUrl(theme.themeColor.light, true)

  const icons: WebManifest['icons'] = useStaticIcons || !anyIcon || !maskableIcon
    ? [
        { src: brand.icons.pwa.any192, sizes: '192x192', type: 'image/png' },
        { src: brand.icons.pwa.any512, sizes: '512x512', type: 'image/png' },
        { src: brand.icons.pwa.maskable512, sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ]
    : [
        { src: anyIcon, sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        { src: maskableIcon, sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' }
      ]

  return {
    name: localize(brand.name, 'fr'),
    short_name: shortNameFor(edition),
    description: localize(brand.tagline, 'fr'),
    lang: 'fr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    theme_color: theme.themeColor.light,
    background_color: theme.backgroundColor,
    icons
  }
}

/** Accès aux données du thème actif (injectables pour les tests). */
export interface ThemeSource {
  /** Identifiant de la personne connectée, ou `null` (visiteur, session invalide). */
  userId: string | null
  loadProfileTheme: (userId: string) => Promise<{ theme_settings: unknown, active_theme_group_id: string | null } | null>
  loadGroupTheme: (groupId: string) => Promise<unknown>
}

/** Thème brut actif de la personne (même règle que `useThemeStore`) ; `null` = thème par défaut. Ne lève jamais. */
export async function activeRawTheme(source: ThemeSource): Promise<unknown> {
  if (!source.userId) return null
  try {
    const profile = await source.loadProfileTheme(source.userId)
    if (!profile) return null
    if (profile.active_theme_group_id) return (await source.loadGroupTheme(profile.active_theme_group_id)) ?? null
    return profile.theme_settings ?? null
  } catch {
    return null
  }
}

export async function manifestFor(options: { v2: boolean, editionId: unknown, source?: ThemeSource }): Promise<WebManifest> {
  if (!options.v2 || !options.source) return buildManifest(getEdition(options.editionId))
  const raw = await activeRawTheme(options.source)
  return buildManifest(resolveTheme(raw ?? DEFAULT_THEME).edition)
}

/** `Cache-Control` : v1 public et court ; v2 privé (dépend du cookie de session), jamais partagé entre personnes. */
export function manifestCacheControl(v2: boolean): string {
  return v2 ? 'private, max-age=300' : 'public, max-age=600'
}

/** Icône SVG de la toque à la couleur donnée ; `null` si la couleur n'est pas un `#rrggbb` (rien n'est jamais recopié tel quel). */
export function iconSvg(color: unknown, maskable: boolean): string | null {
  if (typeof color !== 'string' || !/^[0-9a-f]{6}$/i.test(color)) return null
  const fill = `#${color.toLowerCase()}`
  const glyph = 'M17 21a1 1 0 0 0 1-1v-5.35c0-.457.316-.844.727-1.041a4 4 0 0 0-2.134-7.589a5 5 0 0 0-9.186 0a4 4 0 0 0-2.134 7.588c.411.198.727.585.727 1.041V20a1 1 0 0 0 1 1ZM6 17h12'
  const background = maskable ? `<rect width="64" height="64" fill="${fill}"/>` : `<rect width="64" height="64" rx="14" fill="${fill}"/>`
  const transform = maskable ? 'translate(14 14) scale(1.5)' : 'translate(8 8) scale(2)'
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="512" height="512">${background}<g transform="${transform}" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${glyph}"/></g></svg>`
}
