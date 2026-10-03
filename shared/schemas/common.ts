import { z } from 'zod'

/** Briques communes aux schémas (messages en français). */

export const uuidSchema = z
  .string({ required_error: 'requis', invalid_type_error: 'doit être un identifiant' })
  .uuid('identifiant invalide')

/** Texte optionnel : `null`/`undefined`/`''` acceptés, bornés en longueur. */
export const optionalText = (max: number) =>
  z.string({ invalid_type_error: 'doit être du texte' })
    .max(max, `trop long (max ${max} caractères)`)
    .nullish()

/** Texte obligatoire non vide (espaces retirés), borné en longueur. */
export const requiredText = (max: number) =>
  z.string({ required_error: 'requis', invalid_type_error: 'doit être du texte' })
    .trim()
    .min(1, 'requis')
    .max(max, `trop long (max ${max} caractères)`)

/**
 * Entier ≥ 0 ou `null`. L'éditeur envoie `null` pour un champ vide ; on
 * tolère aussi `''` (champ numérique vidé) et `undefined` → `null`.
 */
export const nullableNonNegativeInt = z.preprocess(
  value => (value === '' || value === undefined ? null : value),
  z.number({ invalid_type_error: 'doit être un nombre' })
    .int('doit être un entier')
    .min(0, 'doit être positif ou nul')
    .nullable()
)

/**
 * Quantité telle que saisie : nombre (`2`), texte (`"1/2"`, `"2 à 3"`), vide ou
 * absente. Le serveur la transmet en texte à Postgres (`parse_amount`).
 */
export const amountSchema = z.union([
  z.string().max(50, 'trop long (max 50 caractères)'),
  z.number({ invalid_type_error: 'doit être un nombre ou du texte' }).min(0, 'doit être positif ou nul')
], { errorMap: () => ({ message: 'doit être un nombre ou du texte' }) }).nullish()

/** Index d'ordre : entier ≥ 0, optionnel (le serveur/SQL complète par la position). */
export const orderIndexSchema = z
  .number({ invalid_type_error: 'doit être un nombre' })
  .int('doit être un entier')
  .min(0, 'doit être positif ou nul')
  .optional()

/** Date du planning au format `YYYY-MM-DD` (calendrier vérifié). */
export const dateStringSchema = z
  .string({ required_error: 'requis', invalid_type_error: 'doit être du texte' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'doit être au format AAAA-MM-JJ')
  .refine((value) => {
    const [y, m, d] = value.split('-').map(Number)
    const date = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 0))
    return date.getUTCFullYear() === y && date.getUTCMonth() === (m ?? 1) - 1 && date.getUTCDate() === d
  }, 'date invalide')

/** Convertit une quantité validée en texte pour Postgres (`null` si vide). */
export function amountToText(amount: string | number | null | undefined): string | null {
  if (amount === null || amount === undefined) return null
  if (typeof amount === 'number') return Number.isFinite(amount) ? String(amount) : null
  const trimmed = amount.trim()
  return trimmed === '' ? null : trimmed
}

/** Texte nettoyé : `null` si vide/absent. */
export function textOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}
