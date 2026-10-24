import { isV2Enabled } from '#shared/utils/v2'

/** `true` quand l'interface v2 est activée (`NUXT_PUBLIC_V2=true`). Voir DEVELOPER.md § 20.10. */
export function useV2(): boolean {
  return isV2Enabled(useRuntimeConfig().public.v2)
}
