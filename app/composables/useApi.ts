/**
 * Wrapper minimal autour de `fetch` pour les appels à notre API interne (/api/*).
 *
 * La session Supabase est portée par un cookie (module @nuxtjs/supabase) : les
 * requêtes same-origin l'envoient automatiquement et `requireUser` côté
 * serveur en dérive l'identité. Plus besoin d'en-tête `Authorization`
 * (toujours accepté par le serveur pour les clients externes).
 *
 * Usage identique à fetch : `await apiFetch('/api/...', { method, body, ... })`.
 */
export const apiFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
  return fetch(url, { credentials: 'same-origin', ...options })
}
