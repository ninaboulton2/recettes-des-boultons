import { boultonsEdition } from '../editions/boultons'
import { genericEdition } from '../editions/generic'
import type { EditionConfig, EditionTheme, NeutralColor } from '../editions/types'
import { GENERATED_PRESETS } from './presets'
import { derivePrimaryShades, generatePalette, NEUTRAL_HEX, type PrimaryRejection } from './palette'
import { parseThemeInput, type ThemeInput, type ThemePresetId } from './schema'

/**
 * Thème validé → configuration d'édition (`EditionConfig`) que le reste de l'application sait déjà lire
 * (`useEdition().config`). Les composants ne changent pas.
 *
 *   - `boultons`   → `boultonsEdition` tel quel (palette bleu-vert, `slate`, illustrations, héros, cocotte) ;
 *   - `terracotta` → `genericEdition` tel quel (thème par défaut du produit) ;
 *   - autre préréglage ou `custom` → `genericEdition` avec la palette générée (nuance 500 = la couleur choisie).
 * `name` (si présent) remplace le nom du site. `home` est accepté mais ignoré : l'accueil suit le préréglage.
 */

/** Thème par défaut (personne sans thème, visiteur) : le thème générique du produit. */
export const DEFAULT_THEME: ThemeInput = { preset: 'terracotta' }

export interface ResolvedTheme {
  /** Entrée validée (jamais le JSON brut). */
  input: ThemeInput
  preset: ThemePresetId | 'custom'
  edition: EditionConfig
}

export type ThemeValidation =
  | { ok: true, theme: ResolvedTheme }
  | { ok: false, reason: 'invalid' | PrimaryRejection }

function withTheme(base: EditionConfig, theme: EditionTheme, name: string | undefined): EditionConfig {
  // Un nom identique à celui du préréglage ne change rien : on rend la configuration d'origine telle quelle.
  if (theme === base.theme && (!name || (name === base.brand.name.fr && name === base.brand.name.en))) return base
  return {
    ...base,
    brand: name ? { ...base.brand, name: { fr: name, en: name } } : base.brand,
    theme
  }
}

function generatedTheme(primary: string, neutral: NeutralColor): { ok: true, theme: EditionTheme } | { ok: false, reason: PrimaryRejection } {
  const palette = generatePalette(primary)
  const shades = derivePrimaryShades(palette, neutral)
  if (!shades.ok) return shades
  return {
    ok: true,
    theme: {
      primary: palette,
      neutral,
      primaryShade: shades.value,
      themeColor: { light: palette[shades.value.light], dark: NEUTRAL_HEX[neutral][900] },
      backgroundColor: NEUTRAL_HEX[neutral][50]
    }
  }
}

/** Valide et résout un thème ; explique le refus (pour l'afficher dans le sélecteur de couleur). */
export function validateTheme(raw: unknown): ThemeValidation {
  const input = parseThemeInput(raw)
  if (!input) return { ok: false, reason: 'invalid' }
  const name = input.name

  if (input.preset === 'boultons') {
    return { ok: true, theme: { input, preset: 'boultons', edition: withTheme(boultonsEdition, boultonsEdition.theme, name) } }
  }
  if (input.preset === 'terracotta') {
    return { ok: true, theme: { input, preset: 'terracotta', edition: withTheme(genericEdition, genericEdition.theme, name) } }
  }

  const generated = input.preset === 'custom'
    ? generatedTheme(input.primary ?? '', input.neutral ?? 'stone')
    : (() => {
        const preset = GENERATED_PRESETS.find(candidate => candidate.id === input.preset)
        return preset ? generatedTheme(preset.primary, preset.neutral) : { ok: false as const, reason: 'invalid' as const }
      })()
  if (!generated.ok) return generated
  return { ok: true, theme: { input, preset: input.preset, edition: withTheme(genericEdition, generated.theme, name) } }
}

/** Thème utilisable dans tous les cas : le thème demandé s'il est valide, sinon le thème par défaut. */
export function resolveTheme(raw: unknown): ResolvedTheme {
  const result = validateTheme(raw)
  if (result.ok) return result.theme
  const fallback = validateTheme(DEFAULT_THEME)
  if (!fallback.ok) throw new Error('Thème par défaut invalide')
  return fallback.theme
}

/** Aperçu d'un préréglage (pastilles du sélecteur) : couleur 500 et nuance de texte. */
export function previewPalette(raw: unknown): { primary: string, shade: string } | null {
  const result = validateTheme(raw)
  if (!result.ok) return null
  const { primary, primaryShade } = result.theme.edition.theme
  return { primary: primary[500], shade: primary[primaryShade.light] }
}
