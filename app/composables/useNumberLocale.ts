import { computed, type ComputedRef } from 'vue'
import { DEFAULT_NUMBER_LOCALE } from '#shared/utils/recipes'

/**
 * Locale BCP 47 de la langue courante pour formater les nombres
 * (`fr-FR` : « 1,5 » ; `en-US` : « 1.5 »), réactive au changement de langue.
 * À passer aux formateurs de `#shared/utils` (`formatAmount`,
 * `formatScaledAmount`, `formatQuantity`…).
 */
export function useNumberLocale(): ComputedRef<string> {
  const { localeProperties } = useI18n()
  return computed(() => localeProperties.value.language ?? DEFAULT_NUMBER_LOCALE)
}
