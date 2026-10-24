import { normalizeContactEmail } from '#shared/legal'

/** Adresse de contact configurée (`NUXT_PUBLIC_CONTACT_EMAIL`), ou `null` si absente ou mal formée. */
export function useContactEmail(): string | null {
  return normalizeContactEmail(useRuntimeConfig().public.contactEmail)
}
