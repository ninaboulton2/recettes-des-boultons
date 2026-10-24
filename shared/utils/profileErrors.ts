/**
 * Erreurs de `update_my_profile` / du déclencheur du pseudonyme (0023) → clé de traduction (`profile.errors.<clé>`).
 * La base répond en français ; l'interface affiche sa propre phrase dans la langue courante.
 */
export type ProfileErrorKey = 'taken' | 'noAt' | 'forbiddenChar' | 'invisibleChar' | 'mixedScripts' | 'length' | 'titleLength' | 'notMember' | 'rate' | 'generic'

interface ErrorLike { code?: unknown, message?: unknown }

export function profileErrorKey(error: unknown): ProfileErrorKey {
  const { code, message } = (typeof error === 'object' && error !== null ? error : {}) as ErrorLike
  const text = typeof message === 'string' ? message.toLowerCase() : ''
  if (code === '54000') return 'rate'
  if (code === '42501') return 'notMember'
  if (code === '22023' || code === '23505') {
    if (text.includes('déjà pris')) return 'taken'
    if (text.includes('« @ »')) return 'noAt'
    if (text.includes('invisible') || text.includes('mise en forme')) return 'invisibleChar'
    if (text.includes('caractère interdit')) return 'forbiddenChar'
    if (text.includes('mélanger')) return 'mixedScripts'
    if (text.includes('titre du carnet')) return 'titleLength'
    if (text.includes('1 à 60')) return 'length'
  }
  if (code === '23505' && text.includes('display_name')) return 'taken'
  return 'generic'
}

/** Contrôle immédiat (avant l'appel) d'un pseudonyme ; la base fait ensuite foi (unicité, caractères refusés). */
export function validateDisplayName(value: string): 'required' | 'noAt' | 'length' | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) return 'required'
  if (trimmed.includes('@')) return 'noAt'
  if (trimmed.length > 60) return 'length'
  return null
}

/** Titre du carnet : 80 caractères au plus, facultatif. */
export const COOKBOOK_TITLE_MAX = 80
