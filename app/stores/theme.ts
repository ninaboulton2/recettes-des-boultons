import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'
import { resolveTheme } from '#shared/themes'
import type { Database } from '#shared/types/database'

/**
 * Thème actif (v2) : le thème PERSONNEL (`profiles.theme_settings`) ou celui d'un de mes groupes
 * (`profiles.active_theme_group_id` → `groups.theme`, via `list_my_groups`). Visiteur : thème par défaut.
 *
 * Le JSON est une entrée non fiable : `resolveTheme` le passe par la liste blanche Zod et ne garde
 * que des valeurs connues ; invalide, il est remplacé par le thème par défaut. Le CSS est généré
 * à partir de ces seules valeurs (`plugins/edition.ts`).
 * `shallowRef` : du JSON récursif (TS2589 avec `ref`), toujours remplacé en bloc.
 */
export const useThemeStore = defineStore('theme', () => {
  const supabase = useSupabaseClient<Database>()
  const authStore = useAuthStore()

  /** Thèmes bruts de mes groupes (non validés), par identifiant de groupe. */
  const groupThemes = shallowRef<Record<string, unknown>>({})
  /** Groupes déjà chargés pour cette personne (évite de redemander à chaque page). */
  const loadedFor = shallowRef<string | null>(null)
  /** Aperçu en direct (sélecteur) : prioritaire tant qu'il est défini. */
  const preview = shallowRef<unknown>(null)

  const raw = computed<unknown>(() => {
    if (preview.value) return preview.value
    const profile = authStore.profile
    if (!authStore.isAuthenticated || !profile) return null
    if (profile.active_theme_group_id) return groupThemes.value[profile.active_theme_group_id] ?? null
    return profile.theme_settings
  })

  const resolved = computed(() => resolveTheme(raw.value))

  async function loadGroupThemes(force = false): Promise<void> {
    const id = authStore.profile?.id ?? null
    if (!id) {
      groupThemes.value = {}
      loadedFor.value = null
      return
    }
    if (!force && loadedFor.value === id) return
    const { data, error } = await supabase.rpc('list_my_groups')
    if (error) {
      console.error('Erreur lors du chargement des thèmes de groupe :', error)
      return
    }
    groupThemes.value = Object.fromEntries((data ?? []).map(group => [group.group_id, group.theme]))
    loadedFor.value = id
  }

  /** Après un changement de thème d'un groupe ou de thème actif. */
  function setPreview(value: unknown): void {
    preview.value = value
  }

  return { groupThemes, preview, raw, resolved, loadGroupThemes, setPreview }
})
