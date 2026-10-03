import { createError, type H3Error } from 'h3'

/**
 * Gestion centralisée des erreurs des endpoints d'écriture.
 *
 * Règle : aucun détail technique (message Supabase/Postgres, stack) ne sort
 * vers le client. Les erreurs « métier » (statut < 500) sont relancées telles
 * quelles ; tout le reste est journalisé côté serveur et remplacé par un 500
 * au message générique.
 */

export const GENERIC_ERROR_MESSAGE = 'Une erreur est survenue, réessayez plus tard.'

/** Forme minimale d'une erreur PostgREST / supabase-js (`{ code, message, details, hint }`). */
export interface SupabaseErrorLike {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

function isH3Error(error: unknown): error is H3Error {
  return typeof error === 'object' && error !== null && 'statusCode' in error
    && typeof (error as { statusCode: unknown }).statusCode === 'number'
}

/**
 * À appeler dans le `catch` final d'un endpoint :
 *  - `statusCode` < 500 → relancé tel quel (déjà destiné au client) ;
 *  - sinon → `console.error('[api] <context>', error)` et 500 générique.
 */
export function handleApiError(error: unknown, context: string): never {
  if (isH3Error(error) && error.statusCode < 500) {
    throw error
  }
  console.error(`[api] ${context}`, error)
  throw createError({ statusCode: 500, statusMessage: GENERIC_ERROR_MESSAGE })
}

/**
 * Traduit une erreur renvoyée par Supabase (requête ou RPC) en erreur HTTP.
 *
 * Seuls les codes SQLSTATE levés volontairement par nos propres fonctions
 * (`raise exception … using errcode`) sont exposés, avec leur message français :
 *  - `22023` (invalid_parameter_value) → 400 (ex. « Unité inconnue : xx »)
 *  - `P0002` (no_data_found)            → 404 (ex. « Recette introuvable »)
 *  - `42501` (insufficient_privilege)   → 403, message fixe
 *  - `23505` (unique_violation)         → 409, message fourni ou fixe
 * Tout autre code (erreur interne, fonction absente, réseau…) est journalisé
 * et devient un 500 générique.
 */
export function throwSupabaseError(error: SupabaseErrorLike, context: string, options: { conflictMessage?: string } = {}): never {
  const code = error.code ?? ''
  const message = (error.message ?? '').trim()

  switch (code) {
    case '22023':
      throw createError({ statusCode: 400, statusMessage: message || 'Données invalides' })
    case 'P0002':
      throw createError({ statusCode: 404, statusMessage: message || 'Ressource introuvable' })
    case '42501':
      throw createError({ statusCode: 403, statusMessage: 'Action non autorisée' })
    case '23505':
      throw createError({ statusCode: 409, statusMessage: options.conflictMessage ?? 'Cet élément existe déjà' })
    default:
      console.error(`[api] ${context}`, error)
      throw createError({ statusCode: 500, statusMessage: GENERIC_ERROR_MESSAGE })
  }
}
