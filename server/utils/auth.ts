import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createError, getHeader, type H3Event } from 'h3'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { Database } from '#shared/types/database'
import type { UserRole } from '#shared/types'

/**
 * Authentification côté serveur.
 *
 * Deux modes sont acceptés, dans cet ordre :
 *  1. En-tête `Authorization: Bearer <jwt>` (clients externes, scripts) : le token
 *     est validé auprès de Supabase et un client *scopé sur ce token* est créé.
 *  2. Cookie de session posé par @nuxtjs/supabase (navigateur, requêtes
 *     same-origin de l'app) : `serverSupabaseClient` lit les cookies et toutes
 *     les requêtes passent par le RLS avec `auth.uid()` renseigné.
 *
 * Dans les deux cas, l'identité vient du token validé (`user.id`) : ne JAMAIS
 * faire confiance à un `userId` fourni dans le body ou la query.
 *
 * Le rôle vient du claim `user_role` ajouté au JWT par le hook
 * `custom_access_token_hook` (migration 0009). Tant que le hook n'est pas actif,
 * ou pour un token émis avant son activation, le claim est absent : on replie
 * alors sur `profiles.role` (même logique que `private.is_admin()` en base).
 */

export interface AuthenticatedUser {
  id: string
  email?: string
  /** Rôle lu dans le JWT (`user_role`), `undefined` si le claim est absent. */
  role?: UserRole
}

export interface AuthContext {
  /**
   * Client Supabase agissant au nom de l'utilisateur (RLS).
   * Volontairement non typé `Database` pour l'instant : les endpoints
   * d'écriture historiques (phase 2 « écritures ») ne compilent pas encore
   * avec les types générés. À resserrer en `SupabaseClient<Database>` quand
   * ils seront migrés.
   */
  supabase: SupabaseClient
  user: AuthenticatedUser
}

const unauthorized = (statusMessage: string) =>
  createError({ statusCode: 401, statusMessage })

function getBearerToken(event: H3Event): string | null {
  const header = getHeader(event, 'authorization') ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(header)
  return match?.[1]?.trim() || null
}

function toUserRole(value: unknown): UserRole | undefined {
  return value === 'admin' || value === 'user' ? value : undefined
}

/** Lit `user_role` dans des claims JWT (à la racine, ou dans `app_metadata`). */
export function roleFromClaims(claims: Record<string, unknown> | null | undefined): UserRole | undefined {
  if (!claims) return undefined
  const appMetadata = claims.app_metadata
  const nested = appMetadata && typeof appMetadata === 'object'
    ? (appMetadata as Record<string, unknown>).user_role
    : undefined
  return toUserRole(claims.user_role) ?? toUserRole(nested)
}

/**
 * Décode la charge utile d'un JWT **déjà validé** (base64url), sans vérifier la
 * signature : à n'utiliser qu'après `auth.getUser(token)`.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const payload = token.split('.')[1]
  if (!payload) return null
  try {
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    const parsed: unknown = JSON.parse(json)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

async function authFromBearer(event: H3Event, token: string): Promise<AuthContext> {
  const { url, key } = useRuntimeConfig(event).public.supabase
  if (!url || !key) {
    throw createError({ statusCode: 500, statusMessage: 'Configuration Supabase manquante' })
  }

  const supabase = createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  })

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) {
    throw unauthorized('Session invalide ou expirée')
  }

  return {
    supabase,
    user: { id: data.user.id, email: data.user.email, role: roleFromClaims(decodeJwtPayload(token)) }
  }
}

async function authFromCookies(event: H3Event): Promise<AuthContext> {
  const supabase = await serverSupabaseClient<Database>(event)

  // serverSupabaseUser lève une erreur quand il n'y a pas de session : on la
  // traduit en 401 plutôt qu'en 500.
  const claims = await serverSupabaseUser(event).catch(() => null)

  if (!claims?.sub) {
    throw unauthorized('Authentification requise')
  }

  const email = typeof claims.email === 'string' ? claims.email : undefined
  return { supabase, user: { id: claims.sub, email, role: roleFromClaims(claims) } }
}

/**
 * Exige un utilisateur authentifié (cookie de session OU en-tête Bearer).
 * Retourne un client Supabase agissant au nom de l'utilisateur et son identité.
 * Lève 401 si la session est absente, invalide ou expirée.
 */
export async function requireUser(event: H3Event): Promise<AuthContext> {
  const token = getBearerToken(event)
  return token ? authFromBearer(event, token) : authFromCookies(event)
}

/**
 * Exige un utilisateur authentifié ET administrateur.
 * Le claim `user_role` du JWT fait foi s'il est présent ; sinon repli sur
 * `profiles.role`. Lève 401 si non connecté, 403 si connecté mais non admin.
 */
export async function requireAdmin(event: H3Event): Promise<AuthContext> {
  const context = await requireUser(event)

  let role = context.user.role
  if (role === undefined) {
    const { data: profile } = await context.supabase
      .from('profiles')
      .select('role')
      .eq('id', context.user.id)
      .maybeSingle()
    role = toUserRole(profile?.role)
  }

  if (role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Accès administrateur requis' })
  }

  return { ...context, user: { ...context.user, role } }
}
