import { isGoogleAuthEnabled } from '#shared/utils/v2'

/** `true` quand la connexion Google est proposée en v2 (`NUXT_PUBLIC_GOOGLE_AUTH=true`). Sans objet en v1. */
export function useGoogleAuth(): boolean {
  return isGoogleAuthEnabled(useRuntimeConfig().public.googleAuth)
}
