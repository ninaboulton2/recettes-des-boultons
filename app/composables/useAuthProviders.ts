export type OAuthProvider = 'google' | 'apple'

const KNOWN: readonly OAuthProvider[] = ['google', 'apple']

/**
 * Fournisseurs OAuth à proposer dans la modale d'authentification, d'après
 * `runtimeConfig.public.authProviders` (`NUXT_PUBLIC_AUTH_PROVIDERS=google,apple`,
 * défaut `google`). Les valeurs inconnues sont ignorées. En v2, `google` est retiré tant que NUXT_PUBLIC_GOOGLE_AUTH n est pas à true.
 */
export function useAuthProviders(): OAuthProvider[] {
  const raw = useRuntimeConfig().public.authProviders
  const hideGoogle = useV2() && !useGoogleAuth()   // v2 : Google OAuth pas encore configuré (NUXT_PUBLIC_GOOGLE_AUTH) ; v1 inchangée
  return String(raw ?? '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter((value): value is OAuthProvider => (KNOWN as readonly string[]).includes(value))
    .filter(value => !(hideGoogle && value === 'google'))
}
