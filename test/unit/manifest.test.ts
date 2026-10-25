import { describe, expect, it } from 'vitest'
import { EDITIONS } from '../../shared/editions'
import { resolveTheme } from '../../shared/themes'
import { activeRawTheme, buildManifest, coloredIconUrl, iconSvg, manifestCacheControl, manifestFor, shortNameFor, type ThemeSource } from '../../server/utils/manifest'

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

describe('manifeste v2 (thème actif)', () => {
  it('visiteur : thème par défaut (Family Cookbook, toque terracotta), sans lecture', async () => {
    const m = await manifestFor({ v2: true, editionId: 'boultons', source: source({ userId: null, loadProfileTheme: async () => { throw new Error('non') } }) })
    expect(m.name).toBe('Family Cookbook')
    expect(m.short_name).toBe('Cookbook')
    expect(m.theme_color).toBe('#c2603e')
    expect(m.icons[0]?.src).toBe('/pwa-192x192.png')
  })
  it('thème de groupe Boultons : nom et cocotte des Boultons', async () => {
    const m = await manifestFor({
      v2: true,
      editionId: 'generic',
      source: source({
        loadProfileTheme: async () => ({ theme_settings: { preset: 'olive' }, active_theme_group_id: GROUP }),
        loadGroupTheme: async id => (id === GROUP ? { preset: 'boultons' } : null)
      })
    })
    expect(m.name).toBe('Recettes des Boultons')
    expect(m.short_name).toBe('Boultons')
    expect(m.icons[0]?.src).toBe('/editions/boultons/pwa-192x192.png')
  })
  it('thème personnel libre : nom, couleur et toque SVG à cette couleur', async () => {
    const m = await manifestFor({
      v2: true,
      editionId: 'boultons',
      source: source({ loadProfileTheme: async () => ({ theme_settings: { preset: 'custom', primary: '#aa4466', neutral: 'stone', name: 'Recettes de Mamie Jeanne' }, active_theme_group_id: null }) })
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
    expect(await activeRawTheme(source({ loadProfileTheme: async () => null }))).toBeNull()
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

describe('nom choisi dans le thème (en-tête, titre, manifeste)', () => {
  it('le nom du thème devient le nom du site ; sans nom, repli sur Family Cookbook', () => {
    expect(resolveTheme({ preset: 'olive', name: 'Chez Mamie' }).edition.brand.name).toEqual({ fr: 'Chez Mamie', en: 'Chez Mamie' })
    expect(resolveTheme({ preset: 'olive' }).edition.brand.name).toEqual({ fr: 'Family Cookbook', en: 'Family Cookbook' })
    expect(resolveTheme({ preset: 'boultons', name: 'Les Boultons 2' }).edition.brand.name.fr).toBe('Les Boultons 2')
    expect(resolveTheme({ preset: 'olive', name: '<b>x</b>' }).edition.brand.name.fr).toBe('Family Cookbook')
  })
  it('manifeste : name et short_name suivent le nom, icône de la couleur du thème', () => {
    const m = buildManifest(resolveTheme({ preset: 'prune', name: 'Chez Mamie' }).edition)
    expect(m.name).toBe('Chez Mamie')
    expect(m.short_name).toBe('Chez Mamie')
    expect(m.icons[0]?.src).toMatch(/^\/pwa-icon\.svg\?c=/)
  })
})

describe('détails du manifeste', () => {
  it('shortNameFor : préréglage inchangé, nom court gardé, nom long coupé au mot', () => {
    expect(shortNameFor(EDITIONS.boultons)).toBe('Boultons')
    expect(shortNameFor(resolveTheme({ preset: 'terracotta', name: 'Chez Léa' }).edition)).toBe('Chez Léa')
    expect(shortNameFor(resolveTheme({ preset: 'terracotta', name: 'Supercalifragilistic' }).edition)).toBe('Supercalifra')
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
