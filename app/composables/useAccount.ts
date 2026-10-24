import type { SupabaseClient } from '@supabase/supabase-js'
import type { z } from 'zod'
import type { Database, Json } from '#shared/types/database'
import { deleteAccountInputSchema, myPreferencesInputSchema, updateMyProfileInputSchema } from '#shared/schemas/social'
import {
  toDeletionBlocker,
  toProfileSettings,
  type DeletionBlocker,
  type ProfileSettings
} from '#shared/utils/social'
import { apiFetch } from './useApi'
import { apiErrorFromResponse } from './useApiError'
import { parseClientInput } from './useCookbook'

/**
 * Profil et compte v2 (migration 0023, dossier §7.4) — profil : appel direct à la RPC `update_my_profile` avec la session ;
 * export : RPC `export_my_data` (3 par jour) ; suppression : route serveur `POST /api/account/delete` (clé service_role
 * côté serveur, jamais dans le navigateur). Interface : page `/reglages` (phase 6D).
 */

type Client = SupabaseClient<Database>

/**
 * Met à jour MON profil. Une clé absente = inchangé. `cookbookTitle: ''` / `null` efface le titre, `themeSettings: null`
 * efface le thème personnel, `activeThemeGroupId: null` revient au thème personnel. Renvoie les valeurs enregistrées.
 * Erreurs : 22023 (pseudonyme avec « @ », déjà pris, vide…), 42501 (thème actif d'un groupe dont on n'est pas membre).
 */
export async function updateMyProfile(supabase: Client, input: z.input<typeof updateMyProfileInputSchema>): Promise<ProfileSettings> {
  const parsed = parseClientInput(updateMyProfileInputSchema, input)
  const given = (key: keyof typeof parsed) => Object.prototype.hasOwnProperty.call(input, key)
  const { data, error } = await supabase.rpc('update_my_profile', {
    p_display_name: parsed.displayName ?? undefined,
    // '' efface côté base ; une clé absente (undefined) laisse le titre inchangé
    p_cookbook_title: given('cookbookTitle') ? (parsed.cookbookTitle ?? '') : undefined,
    p_discoverable: parsed.discoverable ?? undefined,
    // '{}' efface côté base
    p_theme_settings: given('themeSettings') ? ((parsed.themeSettings ?? {}) as Json) : undefined,
    p_active_theme_group_id: parsed.activeThemeGroupId ?? undefined,
    p_personal_theme: given('activeThemeGroupId') && parsed.activeThemeGroupId == null ? true : undefined,
    p_complete_onboarding: parsed.completeOnboarding ? true : undefined
  })
  if (error) throw error
  const row = data?.[0]
  if (!row) throw new Error('Profil introuvable')
  return toProfileSettings(row)
}

export interface MyPreferences {
  language: 'fr' | 'en'
  /** Notifications par e-mail (colonne booléenne `profiles.notifications`, `true` par défaut). */
  notifications: boolean
}

/**
 * Langue préférée et notifications : écriture directe dans MA ligne de `profiles` (les colonnes `language` et `notifications`
 * font partie des 11 que l'API autorise, 0019 ; `update_my_profile` ne les gère pas). `.select()` : 0 ligne = profil introuvable.
 */
export async function updateMyPreferences(supabase: Client, userId: string, input: MyPreferences): Promise<MyPreferences> {
  const parsed = parseClientInput(myPreferencesInputSchema, input)
  const { data, error } = await supabase
    .from('profiles')
    .update({ language: parsed.language, notifications: parsed.notifications })
    .eq('id', userId)
    .select('language, notifications')
  if (error) throw error
  const row = data?.[0]
  if (!row) throw new Error('Profil introuvable')
  return { language: row.language === 'en' ? 'en' : 'fr', notifications: row.notifications !== false }
}

/** Toutes mes données en JSON (« Télécharger mes données »). Les autres personnes n'y figurent que par pseudonyme. */
export async function exportMyData(supabase: Client): Promise<Json> {
  const { data, error } = await supabase.rpc('export_my_data')
  if (error) throw error
  return data
}

/** Groupes que je crée et qui ont d'autres membres : à transférer (ou supprimer) avant la suppression du compte. */
export async function accountDeletionBlockers(supabase: Client): Promise<DeletionBlocker[]> {
  const { data, error } = await supabase.rpc('account_deletion_blockers')
  if (error) throw error
  return (data ?? []).map(toDeletionBlocker)
}

/**
 * Supprime DÉFINITIVEMENT mon compte et mes données (route serveur). `confirmEmail` = l'adresse e-mail du compte.
 * 409 si un groupe est à transférer (`accountDeletionBlockers`). 401 `REAUTH_REQUIRED` (`isReauthRequired(error)`) si la connexion
 * date de plus de 10 minutes : redemander le mot de passe (`supabase.auth.signInWithPassword`) puis réessayer. Après succès, déconnecter la personne.
 */
export async function deleteAccount(input: z.input<typeof deleteAccountInputSchema>): Promise<void> {
  const body = parseClientInput(deleteAccountInputSchema, input)
  const response = await apiFetch('/api/account/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!response.ok) throw await apiErrorFromResponse(response)
}

/** Les fonctions ci-dessus liées au client Supabase de la session courante. */
export function useAccount() {
  const supabase = useSupabaseClient<Database>()
  return {
    updateMyProfile: (input: z.input<typeof updateMyProfileInputSchema>) => updateMyProfile(supabase, input),
    updateMyPreferences: (userId: string, input: MyPreferences) => updateMyPreferences(supabase, userId, input),
    exportMyData: () => exportMyData(supabase),
    accountDeletionBlockers: () => accountDeletionBlockers(supabase),
    deleteAccount: (input: z.input<typeof deleteAccountInputSchema>) => deleteAccount(input)
  }
}
