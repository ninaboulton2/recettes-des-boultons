import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createError, getHeader, type H3Event } from 'h3'

/**
 * Authentification côté serveur.
 *
 * Le client envoie son token Supabase via l'en-tête `Authorization: Bearer <jwt>`.
 * On valide ce token et on crée un client Supabase *scopé sur ce token* : ainsi
 * toutes les requêtes serveur passent par le RLS avec `auth.uid()` correctement
 * renseigné (défense en profondeur = vérification explicite ici + RLS en base).
 *
 * Important : ne JAMAIS faire confiance à un `userId` fourni dans le body ou la
 * query — toujours dériver l'identité de l'utilisateur du token validé (`user.id`).
 */

function getBearerToken(event: H3Event): string {
  const header = getHeader(event, 'authorization') || ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  if (!match) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Authentification requise'
    })
  }
  return match[1].trim()
}

function createScopedClient(token: string): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY

  if (!url || !key) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Configuration Supabase manquante'
    })
  }

  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  })
}

/**
 * Exige un utilisateur authentifié.
 * Retourne un client Supabase scopé sur son token et l'objet `user` validé.
 * Lève 401 si le token est absent, invalide ou expiré.
 */
export async function requireUser(event: H3Event): Promise<{ supabase: SupabaseClient; user: { id: string; email?: string } }> {
  const token = getBearerToken(event)
  const supabase = createScopedClient(token)

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Session invalide ou expirée'
    })
  }

  return { supabase, user: { id: data.user.id, email: data.user.email } }
}

/**
 * Exige un utilisateur authentifié ET administrateur.
 * Lève 401 si non connecté, 403 si connecté mais non admin.
 */
export async function requireAdmin(event: H3Event): Promise<{ supabase: SupabaseClient; user: { id: string; email?: string } }> {
  const { supabase, user } = await requireUser(event)

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (error || profile?.role !== 'admin') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Accès administrateur requis'
    })
  }

  return { supabase, user }
}
