import { defineEventHandler, setResponseHeader } from 'h3'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { Database } from '#shared/types/database'
import { isV2Enabled } from '#shared/utils/v2'
import { manifestCacheControl, manifestFor, type ThemeSource } from '../utils/manifest'

/**
 * GET /manifest.webmanifest — manifeste PWA selon le thème actif (v2) ou l'édition (v1). Voir `server/utils/manifest.ts`.
 * Seulement le titre du carnet de la personne (son nom de site), des couleurs et des icônes du thème ; visiteur : thème par défaut.
 * La lecture passe par le RLS (client de la session) : le thème d'un groupe n'est lu que si la personne en fait partie.
 */
export default defineEventHandler(async (event) => {
  const runtime = useRuntimeConfig(event).public
  const v2 = isV2Enabled(runtime.v2)

  let source: ThemeSource | undefined
  if (v2) {
    const claims = await serverSupabaseUser(event).catch(() => null)
    const userId = typeof claims?.sub === 'string' ? claims.sub : null
    source = {
      userId,
      loadProfileTheme: async (id) => {
        const supabase = await serverSupabaseClient<Database>(event)
        const { data } = await supabase.from('profiles').select('theme_settings, active_theme_group_id, cookbook_title').eq('id', id).maybeSingle()
        return data
      },
      loadGroupTheme: async (groupId) => {
        const supabase = await serverSupabaseClient<Database>(event)
        const { data } = await supabase.rpc('list_my_groups')
        return data?.find(group => group.group_id === groupId)?.theme ?? null
      }
    }
  }

  const manifest = await manifestFor({ v2, editionId: runtime.edition, source })
  setResponseHeader(event, 'Content-Type', 'application/manifest+json; charset=utf-8')
  setResponseHeader(event, 'Cache-Control', manifestCacheControl(v2))
  if (v2) setResponseHeader(event, 'Vary', 'Cookie')
  return manifest
})
