import { describe, expect, it } from 'vitest'
import { boultonsEdition } from '../../shared/editions/boultons'
import { genericEdition } from '../../shared/editions/generic'
import { editionThemeCss } from '../../shared/editions/theme'
import { SHADES } from '../../shared/editions/types'
import {
  DEFAULT_THEME,
  derivePrimaryShades,
  generatePalette,
  GENERATED_PRESETS,
  hexToOklch,
  parseThemeInput,
  resolveTheme,
  THEME_PRESET_IDS,
  validateTheme
} from '../../shared/themes'
import { contrastRatio } from '../../shared/utils/color'

/**
 * Thèmes v2. Le JSON d'un thème de groupe vient d'un tiers (le créateur du groupe, lu par tous les membres) :
 * rien d'autre que la liste blanche ne doit traverser jusqu'au CSS.
 */

const BOULTONS_GROUP_THEME = { preset: 'boultons', primary: '#64b9c3', neutral: 'slate', name: 'Recettes des Boultons', home: 'boultons' }

describe('schéma de thème (liste blanche)', () => {
  it('accepte le thème du groupe Boultons posé par 0018', () => {
    expect(parseThemeInput(BOULTONS_GROUP_THEME)).toEqual(BOULTONS_GROUP_THEME)
  })

  it('accepte chaque préréglage connu et le thème libre', () => {
    for (const preset of THEME_PRESET_IDS) expect(parseThemeInput({ preset })).toEqual({ preset })
    expect(parseThemeInput({ preset: 'custom', primary: '#AA4466' })).toEqual({ preset: 'custom', primary: '#aa4466' })
  })

  it('refuse un préréglage inconnu, un non-objet, un thème libre sans couleur', () => {
    for (const bad of [null, undefined, 'boultons', 42, [], {}, { preset: 'javascript' }, { preset: '' }, { preset: 'custom' }, { preset: ['boultons'] }]) {
      expect(parseThemeInput(bad), JSON.stringify(bad)).toBeNull()
    }
  })

  it('refuse tout ce qui n\'est pas exactement #rrggbb', () => {
    const attacks = [
      'red', 'rgb(0,0,0)', 'url(javascript:alert(1))', '#fff', '#12345', '#1234567', '#gggggg', '#aa4466;}body{display:none', '#aa4466 ',
      '#aa4466}', 'expression(1)', 'var(--x)', '#aa4466\n', '#aa4466/*', ''
    ]
    for (const primary of attacks) expect(parseThemeInput({ preset: 'custom', primary }), primary).toBeNull()
  })

  it('supprime les clés inconnues et ignore (sans refuser) un neutre, un nom ou un accueil hors liste', () => {
    const parsed = parseThemeInput({
      preset: 'olive', css: 'body{display:none}', html: '<img src=x onerror=alert(1)>', background: 'url(x)',
      neutral: 'rainbow', name: '<script>alert(1)</script>', home: 'evil'
    })
    expect(parsed).toEqual({ preset: 'olive' })
  })

  it('le nom ne laisse passer que lettres, chiffres et quelques signes', () => {
    expect(parseThemeInput({ preset: 'olive', name: 'Recettes de Mamie' })?.name).toBe('Recettes de Mamie')
    expect(parseThemeInput({ preset: 'olive', name: 'Café d\'Éloïse & Co (2)' })?.name).toBe('Café d\'Éloïse & Co (2)')
    for (const name of ['<b>x</b>', 'a"b', 'a{b}', 'a;b', 'a\nb', 'x'.repeat(61), '', '  ', 'a<b', '`x`', 'a/b', 'a\\b', 'a:b']) {
      expect(parseThemeInput({ preset: 'olive', name })?.name, name).toBeUndefined()
    }
  })
})

describe('génération de palette', () => {
  it('la nuance 500 est exactement la couleur choisie ; 11 nuances en #rrggbb, du plus clair au plus sombre', () => {
    for (const hex of ['#6f8a3a', '#2f74b5', '#c23a63', '#64b9c3', '#123456']) {
      const palette = generatePalette(hex)
      expect(palette[500]).toBe(hex)
      expect(Object.keys(palette).map(Number)).toEqual([...SHADES])
      for (const shade of SHADES) expect(palette[shade]).toMatch(/^#[0-9a-f]{6}$/)
      const lightness = SHADES.map(shade => hexToOklch(palette[shade]).L)
      for (let i = 1; i < lightness.length; i++) expect(lightness[i]!).toBeLessThan(lightness[i - 1]! + 0.0001)
    }
  })

  it('la palette générée à partir du bleu-vert Boultons reste proche de la palette d\'origine', () => {
    const generated = generatePalette(boultonsEdition.theme.primary[500])
    for (const shade of SHADES) {
      const a = hexToOklch(generated[shade])
      const b = hexToOklch(boultonsEdition.theme.primary[shade])
      expect(Math.abs(a.L - b.L), `L ${shade}`).toBeLessThan(0.12)
    }
  })

  it('choisit des nuances de texte AA (blanc sur la nuance en clair, nuance sur le fond neutre 900 en sombre)', () => {
    for (const preset of GENERATED_PRESETS) {
      const result = validateTheme({ preset: preset.id })
      expect(result.ok, preset.id).toBe(true)
      if (!result.ok) continue
      const { primary, primaryShade, neutral } = result.theme.edition.theme
      expect(contrastRatio('#ffffff', primary[primaryShade.light]), `${preset.id} clair`).toBeGreaterThanOrEqual(4.5)
      const dark = { slate: '#0f172a', gray: '#111827', zinc: '#18181b', neutral: '#171717', stone: '#1c1917' }[neutral]
      expect(contrastRatio(primary[primaryShade.dark], dark), `${preset.id} sombre`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('refuse une couleur trop claire, trop sombre', () => {
    expect(validateTheme({ preset: 'custom', primary: '#ffffff' })).toEqual({ ok: false, reason: 'tooLight' })
    expect(validateTheme({ preset: 'custom', primary: '#fff7a8' })).toEqual({ ok: false, reason: 'tooLight' })
    expect(validateTheme({ preset: 'custom', primary: '#000000' })).toEqual({ ok: false, reason: 'tooDark' })
    expect(validateTheme({ preset: 'custom', primary: 'nope' })).toEqual({ ok: false, reason: 'invalid' })
  })

  it('accepte une couleur libre ordinaire et reste lisible', () => {
    const result = validateTheme({ preset: 'custom', primary: '#aa4466' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.theme.edition.theme.primary[500]).toBe('#aa4466')
    const shades = derivePrimaryShades(result.theme.edition.theme.primary, 'stone')
    expect(shades.ok).toBe(true)
  })
})

describe('résolution du thème actif', () => {
  it('préréglage boultons : exactement l\'édition Boultons d\'origine (look inchangé)', () => {
    const resolved = resolveTheme({ preset: 'boultons' })
    expect(resolved.edition).toBe(boultonsEdition)
    expect(editionThemeCss(resolved.edition)).toBe(editionThemeCss(boultonsEdition))
    // Même résultat avec le JSON complet du groupe (0018) : primary / neutral / home n'ajoutent rien.
    expect(resolveTheme(BOULTONS_GROUP_THEME).edition.theme).toBe(boultonsEdition.theme)
    expect(resolveTheme(BOULTONS_GROUP_THEME).edition.brand.name.fr).toBe('Recettes des Boultons')
  })

  it('terracotta : exactement l\'édition générique', () => {
    expect(resolveTheme({ preset: 'terracotta' }).edition).toBe(genericEdition)
    expect(resolveTheme(DEFAULT_THEME).edition).toBe(genericEdition)
  })

  it('une entrée invalide retombe sur le thème par défaut, jamais sur autre chose', () => {
    for (const bad of [null, 'x', { preset: '<script>' }, { preset: 'custom', primary: 'red' }, { preset: 'custom', primary: '#ffffff' }]) {
      expect(resolveTheme(bad).edition, JSON.stringify(bad)).toBe(genericEdition)
    }
  })

  it('le nom du thème devient le nom du site (texte), sans toucher au reste', () => {
    const resolved = resolveTheme({ preset: 'olive', name: 'Recettes de Mamie' })
    expect(resolved.edition.brand.name).toEqual({ fr: 'Recettes de Mamie', en: 'Recettes de Mamie' })
    expect(resolved.edition.id).toBe('generic')
    expect(resolved.edition.home.variant).toBe('generic')
  })

  it('le CSS généré ne contient que des variables CSS aux valeurs sûres, quelle que soit l\'entrée', () => {
    const hostile = [
      { preset: 'custom', primary: '#aa4466', neutral: 'stone', name: '</style><script>alert(1)</script>' },
      { preset: 'custom', primary: '#aa4466;}body{background:url(//evil)}' },
      { preset: 'olive', css: '}*{display:none}' }
    ]
    for (const input of [...hostile, ...THEME_PRESET_IDS.map(preset => ({ preset })), { preset: 'custom', primary: '#2f74b5' }]) {
      const css = editionThemeCss(resolveTheme(input).edition)
      expect(css, JSON.stringify(input)).not.toMatch(/<|>|url\(|@import|expression|javascript|evil|display:\s*none/i)
      // Seules déclarations possibles : --color-primary-N: #rrggbb ; --ui-color-neutral-N: var(...) ; --ui-primary: var(...)
      const declarations = css.split('\n').map(line => line.trim()).filter(line => line.includes(':') && !line.endsWith('{'))
      for (const line of declarations) {
        expect(line).toMatch(/^(--color-primary-\d+: #[0-9a-f]{6};|--ui-color-neutral-\d+: var\(--color-[a-z]+-\d+, oklch\([\w.% ]+\)\);|--ui-primary: var\(--ui-color-primary-\d+\);)$/)
      }
      expect(css).toMatch(/^:root\[data-edition="(boultons|generic)"\] \{/)
    }
  })
})
