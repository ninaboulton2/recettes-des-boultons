/**
 * Normalise une chaîne pour une comparaison insensible aux accents et à la casse :
 * décomposition Unicode (NFD), suppression des diacritiques, passage en minuscules.
 *
 * Partagé client/serveur (dossier `shared/`).
 */
export function normalizeAccents(value: string | null | undefined): string {
  if (!value) return ''
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}
