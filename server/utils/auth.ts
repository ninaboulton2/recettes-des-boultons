import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createError, getHeader, type H3Event } from 'h3'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

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
 */

export interface AuthenticatedUser {
  id: string
  email?: string
}

export interface AuthContext {
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

async function authFromBearer(event: H3Event, token: string): Promise<AuthContext> {
  const { url, key } = useRuntimeConfig(event).public.supabase
  if (!url || !key) {
    throw createError({ statusCode: 500, statusMessage: 'Configuration Supabase manquante' })
  }

  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  })

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) {
    throw unauthorized('Session invalide ou expirée')
  }

  return { supabase, user: { id: data.user.id, email: data.user.email } }
}

async function authFromCookies(event: H3Event): Promise<AuthContext> {
  const supabase = await serverSupabaseClient(event)

  // serverSupabaseUser lève une erreur quand il n'y a pas de session : on la
  // traduit en 401 plutôt qu'en 500.
  const claims = await serverSupabaseUser(event).catch(() => null)

  if (!claims?.sub) {
    throw unauthorized('Authentification requise')
  }

  const email = typeof claims.email === 'string' ? claims.email : undefined
  return { supabase, user: { id: claims.sub, email } }
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
 * Exige un utilisateur authentifié ET administrateur (`profiles.role = 'admin'`).
 * Lève 401 si non connecté, 403 si connecté mais non admin.
 */
export async function requireAdmin(event: H3Event): Promise<AuthContext> {
  const context = await requireUser(event)

  const { data: profile, error } = await context.supabase
    .from('profiles')
    .select('role')
    .eq('id', context.user.id)
    .single()

  if (error || profile?.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Accès administrateur requis' })
  }

  return context
}
