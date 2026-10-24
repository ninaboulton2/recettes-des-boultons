import { z } from 'zod'

/**
 * Thème d'une personne (`profiles.theme_settings`) ou d'un groupe (`groups.theme`).
 *
 * ⚠️ ENTRÉE NON FIABLE : le créateur d'un groupe fait lire son JSON à tous les membres. La base ne contrôle que
 * « objet de 4000 caractères au plus ». Ce schéma est la LISTE BLANCHE appliquée avant tout usage :
 *   - `preset` parmi les valeurs connues (ou `custom`) ;
 *   - `primary` : `#rrggbb` exactement (jamais `rgb()`, `url()`, nom de couleur, ni `;` ou `}`) ;
 *   - `neutral` parmi cinq valeurs ; `home` parmi deux ;
 *   - `name` : lettres, chiffres, espaces et quelques signes ; il ne sert que de TEXTE (interpolation Vue, échappée),
 *     jamais de HTML ni de CSS ;
 *   - toute autre clé est supprimée (`strip`) : rien d'autre n'est rendu.
 * Les couleurs du CSS final sont générées à partir de ces seules valeurs (voir `resolve.ts`).
 */

export const THEME_PRESET_IDS = ['boultons', 'terracotta', 'olive', 'ocean', 'prune', 'framboise', 'moutarde'] as const
export type ThemePresetId = typeof THEME_PRESET_IDS[number]

export const THEME_NEUTRALS = ['slate', 'gray', 'zinc', 'neutral', 'stone'] as const
export const THEME_HOMES = ['boultons', 'generic'] as const

export const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i
export const hexColorSchema = z.string().regex(HEX_COLOR_PATTERN, 'couleur au format #rrggbb').transform(value => value.toLowerCase())

/** Nom du site pour ce thème : lettres (toutes langues), chiffres, espace et . , ' ’ & ! ( ) - */
export const THEME_NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} .,'’&!()-]*$/u
export const themeNameSchema = z.string().trim().min(1).max(60).regex(THEME_NAME_PATTERN, 'caractères non autorisés')

export const themeInputSchema = z.object({
  preset: z.enum([...THEME_PRESET_IDS, 'custom']),
  primary: hexColorSchema.optional().catch(undefined),
  neutral: z.enum(THEME_NEUTRALS).optional().catch(undefined),
  name: themeNameSchema.optional().catch(undefined),
  home: z.enum(THEME_HOMES).optional().catch(undefined)
}).superRefine((value, ctx) => {
  if (value.preset === 'custom' && !value.primary) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['primary'], message: 'la couleur est requise pour un thème libre' })
  }
})

/** Thème validé : seulement des valeurs de la liste blanche. */
export type ThemeInput = z.infer<typeof themeInputSchema>

/** `null` si l'entrée n'est pas un thème valide (JSON quelconque, clé inconnue de préréglage, couleur invalide…). */
export function parseThemeInput(value: unknown): ThemeInput | null {
  const result = themeInputSchema.safeParse(value)
  if (!result.success) return null
  // `strip` a déjà retiré les clés inconnues ; on reconstruit l'objet sans les clés indéfinies.
  const { preset, primary, neutral, name, home } = result.data
  return {
    preset,
    ...(primary ? { primary } : {}),
    ...(neutral ? { neutral } : {}),
    ...(name ? { name } : {}),
    ...(home ? { home } : {})
  }
}
