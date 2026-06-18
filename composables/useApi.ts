import { useSupabase } from '~/composables/useSupabase'

/**
 * Wrapper autour de `fetch` qui injecte automatiquement le token de session
 * Supabase dans l'en-tête `Authorization: Bearer <jwt>`.
 *
 * Les endpoints serveur (/api/*) valident ce token et en dérivent l'identité
 * de l'utilisateur — on ne transmet donc plus jamais le `userId` en clair.
 *
 * Usage identique à fetch : `await apiFetch('/api/...', { method, body, ... })`.
 */
export const apiFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
  let token: string | null = null

  try {
    const { supabase } = useSupabase()
    const { data } = await supabase.auth.getSession()
    token = data.session?.access_token ?? null
  } catch (e) {
    // Pas de session disponible : on laisse partir la requête sans token
    // (les endpoints publics fonctionnent, les endpoints protégés renverront 401)
    token = null
  }

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined)
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  return fetch(url, { ...options, headers })
}
