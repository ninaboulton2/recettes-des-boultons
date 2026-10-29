/** Chemin de retour après connexion (`?connexion=/favoris`) : un chemin du site seulement, jamais une adresse externe. */
export function safeReturnPath(value: unknown): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== 'string' || raw === '') return null
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\') || [...raw].some(char => char.charCodeAt(0) < 32)) return null
  return raw
}

/** Adresse de l'accueil qui ouvre la connexion puis ramène sur `target` (déjà préfixée de la langue). */
export function loginRedirectUrl(home: string, target: string): string {
  return `${home}?connexion=${encodeURIComponent(target)}`
}
