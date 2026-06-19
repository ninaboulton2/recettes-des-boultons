import { createError } from 'h3'

/**
 * Garde-fous de validation pour les entrées des endpoints.
 * Lèvent une erreur 400 lisible si la valeur est invalide.
 */

export function requireString(
  value: unknown,
  field: string,
  opts: { min?: number; max?: number; required?: boolean } = {}
): string {
  const { min = 1, max = 10000, required = true } = opts

  if (value === undefined || value === null || value === '') {
    if (required) {
      throw createError({ statusCode: 400, statusMessage: `Le champ "${field}" est requis` })
    }
    return ''
  }

  if (typeof value !== 'string') {
    throw createError({ statusCode: 400, statusMessage: `Le champ "${field}" doit être du texte` })
  }

  const v = value.trim()
  if (required && v.length < min) {
    throw createError({ statusCode: 400, statusMessage: `Le champ "${field}" est trop court` })
  }
  if (v.length > max) {
    throw createError({ statusCode: 400, statusMessage: `Le champ "${field}" est trop long (max ${max} caractères)` })
  }
  return v
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function requireUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw createError({ statusCode: 400, statusMessage: `Identifiant "${field}" invalide` })
  }
  return value
}
