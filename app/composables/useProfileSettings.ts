import type { z } from 'zod'
import type { updateMyProfileInputSchema } from '#shared/schemas/social'
import type { Database } from '#shared/types/database'
import { profileErrorKey } from '#shared/utils/profileErrors'
import type { ProfileSettings } from '#shared/utils/social'
import { updateMyProfile } from './useAccount'

/**
 * Enregistre MON profil (RPC `update_my_profile`) et met à jour le profil du store `auth`, d'où viennent le
 * thème actif et le pseudonyme affichés : pas de rechargement nécessaire.
 */
export function useProfileSettings() {
  const supabase = useSupabaseClient<Database>()
  const authStore = useAuthStore()
  const { t } = useI18n()

  async function save(input: z.input<typeof updateMyProfileInputSchema>): Promise<ProfileSettings> {
    const settings = await updateMyProfile(supabase, input)
    const current = authStore.profile
    if (current) {
      authStore.profile = {
        ...current,
        display_name: settings.displayName,
        cookbook_title: settings.cookbookTitle,
        discoverable: settings.discoverable,
        theme_settings: settings.themeSettings as typeof current.theme_settings,
        active_theme_group_id: settings.activeThemeGroupId,
        onboarded_at: settings.onboardedAt ?? current.onboarded_at
      }
    }
    return settings
  }

  /** Message d'erreur dans la langue courante. */
  const errorMessage = (error: unknown): string => t(`profile.errors.${profileErrorKey(error)}`)

  return { save, errorMessage }
}
