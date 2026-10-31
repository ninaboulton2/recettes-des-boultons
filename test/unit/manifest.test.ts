import { describe, expect, it } from 'vitest'
import { EDITIONS } from '../../shared/editions'
import { resolveTheme } from '../../shared/themes'
import { activeProfile, buildManifest, coloredIconUrl, iconSvg, manifestCacheControl, manifestFor, shortNameFor, type ThemeSource } from '../../server/utils/manifest'

const GROUP = '11111111-1111-4111-8111-111111111111'
const source = (over: Partial<ThemeSource> = {}): ThemeSource => ({
  userId: 'u1',
  loadProfileTheme: async () => ({ theme_settings: null, active_theme_group_id: null }),
  loadGroupTheme: async () => null,
  ...over
})

describe('manifeste v1 (édition)', () => {
  it('boultons : nom, couleurs et cocotte d\'origine', async () => {
    const m = await manifestFor({ v2: false, editionId: 'boultons' })
    expect(m.name).toBe('Recettes des Boultons')
    expect(m.short_name).toBe('Boultons')
    expect(m.theme_color).toBe(EDITIONS.boultons.theme.themeColor.light)
    expect(m.background_color).toBe(EDITIONS.boultons.theme.backgroundColor)
    expect(m.icons.map(i => i.src)).toEqual(['/editions/boultons/pwa-192x192.png', '/editions/boultons/pwa-512x512.png', '/editions/boultons/maskable-icon-512x512.png'])
    expect(m.icons[2]?.purpose).toBe('maskable')
    expect(m.start_url).toBe('/')
    expect(m.display).toBe('standalone')
  })
  it('générique : Family Cookbook et toque terracotta ; édition inconnue = boultons', async () => {
    const m = await manifestFor({ v2: false, editionId: 'generic' })
    expect(m.name).toBe('Family Cookbook')
    expect(m.icons[0]?.src).toBe('/pwa-192x192.png')
    expect((await manifestFor({ v2: false, editionId: 'zzz' })).name).toBe('Recettes des Boultons')
  })
  it('v1 : la source de thème est ignorée (aucune lecture)', async () => {
    const m = await manifestFor({ v2: false, editionId: 'boultons', source: source({ userId: 'u1', loadProfileTheme: async () => { throw new Error('ne doit pas être appelée') } }) })
    expect(m.name).toBe('Recettes des Boultons')
  })
})

describe('manifeste v2 (look du thème actif, nom = titre du carnet)', () => {
  it('visiteur : thème par défaut (Family Cookbook, toque terracotta), sans lecture', async () => {
    const m = await manifestFor({ v2: true, editionId: 'boultons', source: source({ userId: null, loadProfileTheme: async () => { throw new Error('non') } }) })
    expect(m.name).toBe('Family Cookbook')
    expect(m.short_name).toBe('Cookbook')
    expect(m.theme_color).toBe('#c2603e')
    expect(m.icons[0]?.src).toBe('/pwa-192x192.png')
  })
  it('thème de groupe Boultons : cocotte des Boultons, mais le nom est le titre du carnet (jamais le nom du groupe)', async () => {
    const groupSource = (cookbook_title: string | null) => source({
      loadProfileTheme: async () => ({ theme_settings: { preset: 'olive' }, active_theme_group_id: GROUP, cookbook_title }),
      loadGroupTheme: async id => (id === GROUP ? { preset: 'boultons', name: 'Les Boultons (nom du groupe)' } : null)
    })
    const own = await manifestFor({ v2: true, editionId: 'generic', source: groupSource('Recettes de Léa') })
    expect(own.name).toBe('Recettes de Léa')
    expect(own.icons[0]?.src).toBe('/editions/boultons/pwa-192x192.png')
    const none = await manifestFor({ v2: true, editionId: 'generic', source: groupSource('  ') })
    expect(none.name).toBe('Family Cookbook')
    expect(none.short_name).toBe('Cookbook')
    expect(JSON.stringify(none)).not.toContain('nom du groupe')
  })
  it('titre « Recettes des Boultons » : nom court du préréglage', async () => {
    const m = await manifestFor({ v2: true, editionId: 'generic', source: source({ loadProfileTheme: async () => ({ theme_settings: { preset: 'boultons' }, active_theme_group_id: null, cookbook_title: 'Recettes des Boultons' }) }) })
    expect(m.name).toBe('Recettes des Boultons')
    expect(m.short_name).toBe('Boultons')
  })
  it('thème personnel libre : titre du carnet, couleur et toque SVG à cette couleur (l\'ancien « name » du thème est ignoré)', async () => {
    const m = await manifestFor({
      v2: true,
      editionId: 'boultons',
      source: source({ loadProfileTheme: async () => ({ theme_settings: { preset: 'custom', primary: '#aa4466', neutral: 'stone', name: 'Ancien nom du thème' }, active_theme_group_id: null, cookbook_title: 'Recettes de Mamie Jeanne' }) })
    })
    expect(m.name).toBe('Recettes de Mamie Jeanne')
    expect(m.short_name.length).toBeLessThanOrEqual(12)
    expect(m.short_name).toBe('Recettes de')
    expect(m.icons.every(i => i.type === 'image/svg+xml')).toBe(true)
    expect(m.icons[0]?.src).toMatch(/^\/pwa-icon\.svg\?c=[0-9a-f]{6}$/)
    expect(m.icons[1]?.src).toMatch(/&m=1$/)
    expect(m.icons[1]?.purpose).toBe('maskable')
    expect(m.theme_color).toBe(resolveTheme({ preset: 'custom', primary: '#aa4466', neutral: 'stone' }).edition.theme.themeColor.light)
  })
  it('préréglage coloré sans nom : nom du produit, toque colorée', async () => {
    const m = await manifestFor({ v2: true, editionId: 'boultons', source: source({ loadProfileTheme: async () => ({ theme_settings: { preset: 'ocean' }, active_theme_group_id: null }) }) })
    expect(m.name).toBe('Family Cookbook')
    expect(m.short_name).toBe('Cookbook')
    expect(m.icons[0]?.type).toBe('image/svg+xml')
  })
  it('thème invalide, groupe introuvable ou erreur de lecture : thème par défaut, jamais d\'erreur', async () => {
    const generic = 'Family Cookbook'
    expect((await manifestFor({ v2: true, editionId: 'boultons', source: source({ loadProfileTheme: async () => ({ theme_settings: { preset: 'custom', primary: 'red;}' }, active_theme_group_id: null }) }) })).name).toBe(generic)
    expect((await manifestFor({ v2: true, editionId: 'boultons', source: source({ loadProfileTheme: async () => ({ theme_settings: null, active_theme_group_id: GROUP }) }) })).name).toBe(generic)
    expect((await manifestFor({ v2: true, editionId: 'boultons', source: source({ loadProfileTheme: async () => { throw new Error('base indisponible') } }) })).name).toBe(generic)
    expect(await activeProfile(source({ loadProfileTheme: async () => null }))).toEqual({ rawTheme: null, cookbookTitle: null })
  })
  it('le contenu ne dépend que du thème : aucun identifiant de personne ni de groupe dans la réponse', async () => {
    const m = await manifestFor({
      v2: true,
      editionId: 'boultons',
      source: source({ userId: 'user-secret-id', loadProfileTheme: async () => ({ theme_settings: null, active_theme_group_id: GROUP }), loadGroupTheme: async () => ({ preset: 'prune' }) })
    })
    const json = JSON.stringify(m)
    expect(json).not.toContain('user-secret-id')
    expect(json).not.toContain(GROUP)
  })
})

describe('nom du site dans le manifeste', () => {
  it('le thème ne change jamais le nom : seul le nom passé (titre du carnet) compte', () => {
    expect(buildManifest(resolveTheme({ preset: 'olive', name: 'Chez Mamie' }).edition).name).toBe('Family Cookbook')
    expect(buildManifest(resolveTheme({ preset: 'prune' }).edition, 'Chez Mamie').name).toBe('Chez Mamie')
    expect(buildManifest(resolveTheme({ preset: 'prune' }).edition, 'Chez Mamie').icons[0]?.src).toMatch(/^\/pwa-icon\.svg\?c=/)
  })
})

describe('détails du manifeste', () => {
  it('shortNameFor : préréglage inchangé, nom court gardé, nom long coupé au mot', () => {
    expect(shortNameFor(EDITIONS.boultons)).toBe('Boultons')
    expect(shortNameFor(EDITIONS.generic, 'Chez Léa')).toBe('Chez Léa')
    expect(shortNameFor(EDITIONS.generic, 'Supercalifragilistic')).toBe('Supercalifra')
    expect(shortNameFor(EDITIONS.boultons, 'Family Cookbook')).toBe('Cookbook')
  })
  it('buildManifest : cohérent avec l\'édition', () => {
    expect(buildManifest(EDITIONS.generic).theme_color).toBe('#c2603e')
  })
  it('coloredIconUrl : seulement #rrggbb', () => {
    expect(coloredIconUrl('#AA4466', false)).toBe('/pwa-icon.svg?c=aa4466')
    expect(coloredIconUrl('red', false)).toBeNull()
    expect(coloredIconUrl('#fff', true)).toBeNull()
  })
  it('cache : v2 privé et court, v1 public', () => {
    expect(manifestCacheControl(true)).toBe('private, max-age=300')
    expect(manifestCacheControl(false)).toBe('public, max-age=600')
  })
  it('iconSvg : couleur validée, rien d\'autre n\'entre dans le SVG', () => {
    expect(iconSvg('aa4466', false)).toContain('fill="#aa4466"')
    expect(iconSvg('aa4466', true)).toContain('scale(1.5)')
    for (const bad of [undefined, '', 'aa446', 'aa44667', '#aa4466', '"><script>', ['aa4466'], 123456]) expect(iconSvg(bad, false), String(bad)).toBeNull()
  })
})

describe('manifeste v2 : titre du carnet dans la langue de l\'interface (0034)', () => {
  const withTitle = (language?: string) => source({
    loadProfileTheme: async () => ({ theme_settings: null, active_theme_group_id: null, cookbook_title: 'Recettes des Boultons', cookbook_title_i18n: { fr: 'Recettes des Boultons', en: 'The Boultons\' Recipes' }, language })
  })
  it('langue de l\'interface (cookie) d\'abord, sinon langue du profil, sinon le titre d\'origine', async () => {
    expect((await manifestFor({ v2: true, editionId: 'boultons', source: withTitle('fr'), locale: 'en' })).name).toBe('The Boultons\' Recipes')
    expect((await manifestFor({ v2: true, editionId: 'boultons', source: withTitle('en') })).name).toBe('The Boultons\' Recipes')
    expect((await manifestFor({ v2: true, editionId: 'boultons', source: withTitle('fr') })).name).toBe('Recettes des Boultons')
    expect((await manifestFor({ v2: true, editionId: 'boultons', source: withTitle() })).name).toBe('Recettes des Boultons')
  })
  it('sans la colonne (0034 non appliquée) : le titre d\'origine', async () => {
    const legacy = source({ loadProfileTheme: async () => ({ theme_settings: null, active_theme_group_id: null, cookbook_title: 'Chez Mamie' }) })
    expect((await manifestFor({ v2: true, editionId: 'boultons', source: legacy, locale: 'en' })).name).toBe('Chez Mamie')
  })
})
