import type { z } from 'zod'
import type { updateMyProfileInputSchema } from '#shared/schemas/social'
import type { Database } from '#shared/types/database'
import { profileErrorKey } from '#shared/utils/profileErrors'
import type { ProfileSettings } from '#shared/utils/social'
import { updateMyPreferences, updateMyProfile, type MyPreferences } from './useAccount'

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

  /**
   * Langue préférée, notifications (colonnes de `profiles`, écriture directe) et visibilité dans la recherche (`update_my_profile`).
   * Deux appels, pas une transaction : en cas d'échec du second, le premier reste enregistré (rien de grave : ce sont des préférences).
   */
  async function savePreferences(input: MyPreferences & { discoverable: boolean }): Promise<void> {
    const me = authStore.currentUser?.id
    if (!me) throw Object.assign(new Error('Connexion requise'), { code: '42501' })
    const prefs = await updateMyPreferences(supabase, me, { language: input.language, notifications: input.notifications })
    const current = authStore.profile
    if (current) authStore.profile = { ...current, language: prefs.language, notifications: prefs.notifications }
    await save({ discoverable: input.discoverable })
  }

  /** Message d'erreur dans la langue courante. */
  const errorMessage = (error: unknown): string => t(`profile.errors.${profileErrorKey(error)}`)

  return { save, savePreferences, errorMessage }
}
