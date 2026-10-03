import { createError, getQuery, getRouterParams, readBody, type H3Event } from 'h3'
import type { ZodIssue, ZodTypeAny, z } from 'zod'

/**
 * Validation des entrées des endpoints avec Zod.
 *
 * `validateBody`, `validateQuery` et `validateRouterParams`
 * renvoient la valeur typée ou lèvent une erreur 400 dont le `statusMessage`
 * (en français) liste les champs invalides, ex. :
 *   « Données invalides : recipe.title : requis ; recipe.sections[0].ingredients[1].name : requis »
 */

const DEFAULT_ZOD_MESSAGE = /^(Required|Expected|Invalid|String must|Number must|Array must|Too|Unrecognized)/

function describeIssue(issue: ZodIssue): string {
  // Les messages définis explicitement dans nos schémas (déjà en français)
  // priment sur les messages par défaut de Zod (en anglais).
  if (!DEFAULT_ZOD_MESSAGE.test(issue.message)) return issue.message

  switch (issue.code) {
    case 'invalid_type':
      return issue.received === 'undefined' || issue.received === 'null' ? 'requis' : 'type invalide'
    case 'too_small':
      if (issue.type === 'string') return issue.minimum === 1 ? 'requis' : `trop court (min ${issue.minimum})`
      if (issue.type === 'array') return `pas assez d'éléments (min ${issue.minimum})`
      return `trop petit (min ${issue.minimum})`
    case 'too_big':
      if (issue.type === 'string') return `trop long (max ${issue.maximum} caractères)`
      if (issue.type === 'array') return `trop d'éléments (max ${issue.maximum})`
      return `trop grand (max ${issue.maximum})`
    case 'invalid_enum_value':
      return 'valeur non autorisée'
    case 'invalid_string':
      return issue.validation === 'uuid' ? 'identifiant invalide' : 'format invalide'
    case 'invalid_union':
      return 'valeur invalide'
    case 'unrecognized_keys':
      return 'champs inconnus'
    default:
      return 'valeur invalide'
  }
}

function describePath(path: Array<string | number>): string {
  if (path.length === 0) return 'corps de la requête'
  return path.reduce<string>((acc, segment) => {
    if (typeof segment === 'number') return `${acc}[${segment}]`
    return acc === '' ? segment : `${acc}.${segment}`
  }, '')
}

/** Résumé lisible (français) d'une liste d'erreurs Zod (5 champs max). */
export function formatZodIssues(issues: ZodIssue[]): string {
  const parts: string[] = []
  for (const issue of issues) {
    const part = `${describePath(issue.path)} : ${describeIssue(issue)}`
    if (!parts.includes(part)) parts.push(part)
    if (parts.length >= 5) break
  }
  const rest = issues.length - parts.length
  const more = rest > 0 ? ` (et ${rest} autre${rest > 1 ? 's' : ''})` : ''
  return `Données invalides : ${parts.join(' ; ')}${more}`
}

function parseOrThrow<T extends ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw createError({ statusCode: 400, statusMessage: formatZodIssues(result.error.issues) })
  }
  return result.data
}

/** Lit et valide le corps JSON de la requête (400 lisible si invalide). */
export async function validateBody<T extends ZodTypeAny>(event: H3Event, schema: T): Promise<z.infer<T>> {
  let body: unknown
  try {
    body = await readBody(event)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Corps de requête illisible (JSON attendu)' })
  }
  if (body === undefined || body === null || typeof body !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'Corps de requête manquant (objet JSON attendu)' })
  }
  return parseOrThrow(schema, body)
}

/** Valide la query string (400 lisible si invalide). */
export function validateQuery<T extends ZodTypeAny>(event: H3Event, schema: T): z.infer<T> {
  return parseOrThrow(schema, getQuery(event))
}

/** Valide les paramètres de route (`[id].ts`) (400 lisible si invalide). */
export function validateRouterParams<T extends ZodTypeAny>(event: H3Event, schema: T): z.infer<T> {
  return parseOrThrow(schema, getRouterParams(event))
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Garde-fou ponctuel : exige un uuid, sinon 400. */
export function requireUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw createError({ statusCode: 400, statusMessage: `Identifiant "${field}" invalide` })
  }
  return value
}
