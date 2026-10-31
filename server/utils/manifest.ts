import { EDITIONS, getEdition, localize, type EditionConfig } from '../../shared/editions'
import { BRAND_NAME } from '../../shared/brand'
import { HEX_COLOR_PATTERN } from '../../shared/themes/schema'
import { DEFAULT_THEME, resolveTheme } from '../../shared/themes'
import { cleanCookbookTitle } from '../../shared/utils/siteName'

/**
 * Manifeste PWA (`/manifest.webmanifest`, DEVELOPER.md § 20.18).
 *
 * - v1 : le manifeste de l'édition (`NUXT_PUBLIC_EDITION`), identique à l'ancien manifeste figé au build.
 * - v2 : le LOOK du THÈME ACTIF de la personne connectée (thème personnel ou d'un de ses groupes ; visiteur : thème par défaut)
 *   et, comme nom, son « Titre du carnet » (`profiles.cookbook_title`), sinon « Family Cookbook ». Jamais le nom d'un groupe.
 *   Le thème est une entrée non fiable : il passe par `resolveTheme` (liste blanche) ; le titre n'est que du texte JSON.
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

/** Nom court : celui du préréglage si le nom est le sien, sinon le nom raccourci (12 caractères au plus, au mot). */
export function shortNameFor(edition: EditionConfig, fullName: string = edition.brand.name.fr): string {
  for (const base of Object.values(EDITIONS)) {
    if (fullName === base.brand.name.fr) return base.brand.shortName
  }
  if (fullName.length <= 12) return fullName
  const cut = fullName.slice(0, 12)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace >= 4 ? cut.slice(0, lastSpace) : cut).trim()
}

/** Adresse de l'icône SVG colorée (`maskable` : fond plein cadre). `null` si la couleur n'est pas un `#rrggbb`. */
export function coloredIconUrl(color: string, maskable: boolean): string | null {
  if (!HEX_COLOR_PATTERN.test(color)) return null
  return `/pwa-icon.svg?c=${color.slice(1).toLowerCase()}${maskable ? '&m=1' : ''}`
}

/** `name` : nom du site (v2 : titre du carnet) ; absent, celui de l'édition (v1). */
export function buildManifest(edition: EditionConfig, name?: string): WebManifest {
  const { brand, theme } = edition
  const fullName = name ?? localize(brand.name, 'fr')
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
    name: fullName,
    short_name: shortNameFor(edition, fullName),
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
  loadProfileTheme: (userId: string) => Promise<{ theme_settings: unknown, active_theme_group_id: string | null, cookbook_title?: string | null } | null>
  loadGroupTheme: (groupId: string) => Promise<unknown>
}

/** Thème brut actif de la personne (même règle que `useThemeStore`) et titre de son carnet. Ne lève jamais : défaut. */
export async function activeProfile(source: ThemeSource): Promise<{ rawTheme: unknown, cookbookTitle: string | null }> {
  if (!source.userId) return { rawTheme: null, cookbookTitle: null }
  try {
    const profile = await source.loadProfileTheme(source.userId)
    if (!profile) return { rawTheme: null, cookbookTitle: null }
    const cookbookTitle = cleanCookbookTitle(profile.cookbook_title)
    if (profile.active_theme_group_id) return { rawTheme: (await source.loadGroupTheme(profile.active_theme_group_id)) ?? null, cookbookTitle }
    return { rawTheme: profile.theme_settings ?? null, cookbookTitle }
  } catch {
    return { rawTheme: null, cookbookTitle: null }
  }
}

export async function manifestFor(options: { v2: boolean, editionId: unknown, source?: ThemeSource }): Promise<WebManifest> {
  if (!options.v2 || !options.source) return buildManifest(getEdition(options.editionId))
  const { rawTheme, cookbookTitle } = await activeProfile(options.source)
  return buildManifest(resolveTheme(rawTheme ?? DEFAULT_THEME).edition, cookbookTitle ?? BRAND_NAME)
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
