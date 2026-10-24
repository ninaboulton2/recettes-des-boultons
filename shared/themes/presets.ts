import type { NeutralColor } from '../editions/types'
import type { ThemePresetId } from './schema'

/**
 * Préréglages générés à partir d'une seule couleur (nuance 500). `boultons` et `terracotta` ne sont PAS ici :
 * leurs palettes sont écrites à la main dans `shared/editions/` (look d'origine strictement conservé).
 */
export interface GeneratedPreset {
  id: Exclude<ThemePresetId, 'boultons' | 'terracotta'>
  primary: string
  neutral: NeutralColor
}

export const GENERATED_PRESETS: readonly GeneratedPreset[] = [
  { id: 'olive', primary: '#6f8a3a', neutral: 'stone' },
  { id: 'ocean', primary: '#2f74b5', neutral: 'slate' },
  { id: 'prune', primary: '#8e4a85', neutral: 'zinc' },
  { id: 'framboise', primary: '#c23a63', neutral: 'neutral' },
  { id: 'moutarde', primary: '#b8861b', neutral: 'stone' }
]
