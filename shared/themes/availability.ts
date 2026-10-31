import type { ThemePresetId } from './schema'

/**
 * Préréglages réservés : le thème « Les Boultons » (`boultons`) n'est pas proposé aux nouvelles personnes. Ce fichier ne décide que
 * de l'AFFICHAGE (sélecteur grisé + explication) ; la règle est appliquée par la base (migration 0034, déclencheurs
 * `trg_0034_profiles_boultons_theme` et `trg_0034_groups_boultons_theme`, SQLSTATE 42501 « Thème réservé aux Boultons »).
 *
 * Qui peut l'utiliser :
 *  - thème PERSONNEL : une personne membre d'un groupe dont le thème est déjà `boultons`, ou qui l'a déjà (elle le garde) ;
 *  - thème d'un GROUPE : seulement un groupe qui l'a déjà (le groupe « Les Boultons » le garde). Le créateur d'un autre groupe ne peut
 *    pas le donner à son groupe, même s'il est lui-même membre des Boultons.
 */
export const RESERVED_PRESETS: readonly ThemePresetId[] = ['boultons']

export type ThemePickerMode = 'personal' | 'group'

export interface PresetAvailabilityContext {
  mode: ThemePickerMode
  /** Thèmes bruts des groupes dont la personne est membre (`list_my_groups`). */
  memberGroupThemes: readonly unknown[]
  /** Préréglage déjà enregistré pour ce thème (personnel ou du groupe édité), s'il y en a un. */
  currentPreset?: string | null
}

export const presetOf = (theme: unknown): string | null =>
  typeof theme === 'object' && theme !== null && typeof (theme as { preset?: unknown }).preset === 'string'
    ? (theme as { preset: string }).preset
    : null

/** Le préréglage peut-il être choisi ? Les préréglages ordinaires le sont toujours. */
export function isPresetAvailable(preset: string, context: PresetAvailabilityContext): boolean {
  if (!(RESERVED_PRESETS as readonly string[]).includes(preset)) return true
  if (context.currentPreset === preset) return true
  if (context.mode === 'group') return false
  return context.memberGroupThemes.some(theme => presetOf(theme) === preset)
}
