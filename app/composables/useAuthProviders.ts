export type OAuthProvider = 'google' | 'apple'

const KNOWN: readonly OAuthProvider[] = ['google', 'apple']

/**
 * Fournisseurs OAuth à proposer dans la modale d'authentification, d'après
 * `runtimeConfig.public.authProviders` (`NUXT_PUBLIC_AUTH_PROVIDERS=google,apple`,
 * défaut `google`). Les valeurs inconnues sont ignorées.
 */
export function useAuthProviders(): OAuthProvider[] {
  const raw = useRuntimeConfig().public.authProviders
  return String(raw ?? '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter((value): value is OAuthProvider => (KNOWN as readonly string[]).includes(value))
}
