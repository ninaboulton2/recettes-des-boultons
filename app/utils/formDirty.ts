/**
 * Détection de modifications non enregistrées d'un formulaire : on compare une
 * version normalisée de l'état courant à celle prise à l'ouverture.
 */

/**
 * Normalise un état de formulaire pour la comparaison : retire les clés
 * techniques `key` (identifiants de liste régénérés), confond `undefined`,
 * `null` et chaîne vide (indiscernables pour l'utilisateur), et ignore
 * l'espacement de début/fin des textes.
 */
export function normalizeForm(value: unknown): unknown {
  if (value === undefined || value === null) return null
  if (typeof value === 'string') return value.trim() === '' ? null : value.trim()
  if (Array.isArray(value)) return value.map(normalizeForm)
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const name of Object.keys(value as Record<string, unknown>).sort()) {
      if (name === 'key') continue
      result[name] = normalizeForm((value as Record<string, unknown>)[name])
    }
    return result
  }
  return value
}

/** Instantané comparable (chaîne JSON de la forme normalisée). */
export const formSnapshot = (value: unknown): string => JSON.stringify(normalizeForm(value))

/** Vrai si l'état courant (et le changement de photo) diffère de l'instantané d'ouverture. */
export function isFormDirty(current: unknown, snapshot: string, photoChanged = false): boolean {
  return photoChanged || formSnapshot(current) !== snapshot
}
