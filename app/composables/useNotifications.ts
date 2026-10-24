import type { SupabaseClient } from '@supabase/supabase-js'
import type { z } from 'zod'
import type { Database } from '#shared/types/database'
import { listNotificationsInputSchema, markNotificationsReadInputSchema } from '#shared/schemas/social'
import { toNotification, type AppNotification } from '#shared/utils/social'
import { parseClientInput } from './useCookbook'

/**
 * Notifications v2 (migration 0023) — la cloche. Créées par la base (demande d'ami, invitation de groupe, recette
 * partagée avec moi, recette supprimée…), jamais par le client. Payload : identifiants, pseudonymes, titres ; jamais
 * d'e-mail. Appels directs aux RPC avec la session de la personne.
 */

type Client = SupabaseClient<Database>

export interface NotificationsPage {
  items: AppNotification[]
  /** À passer en `before` pour la page suivante ; `null` s'il n'y en a plus. */
  nextBefore: string | null
}

/** Les plus récentes d'abord. Page suivante : `before` = `nextBefore` de la page précédente. */
export async function listNotifications(supabase: Client, input: z.input<typeof listNotificationsInputSchema> = {}): Promise<NotificationsPage> {
  const { limit, before } = parseClientInput(listNotificationsInputSchema, input)
  const { data, error } = await supabase.rpc('list_notifications', { p_limit: limit, p_before: before ?? undefined })
  if (error) throw error
  const rows = data ?? []
  const items = rows.map(toNotification)
  return { items, nextBefore: rows.length === limit ? (rows[rows.length - 1]?.created_at ?? null) : null }
}

/** Marque comme lues les notifications indiquées, ou toutes sans `ids`. Renvoie le nombre marqué. */
export async function markNotificationsRead(supabase: Client, input: z.input<typeof markNotificationsReadInputSchema> = {}): Promise<number> {
  const { ids } = parseClientInput(markNotificationsReadInputSchema, input)
  const { data, error } = await supabase.rpc('mark_notifications_read', { p_ids: ids ?? undefined })
  if (error) throw error
  return data ?? 0
}

/** Nombre de notifications non lues (pastille de la cloche). */
export async function unreadNotificationsCount(supabase: Client): Promise<number> {
  const { data, error } = await supabase.rpc('unread_notifications_count')
  if (error) throw error
  return data ?? 0
}

/** Les fonctions ci-dessus liées au client Supabase de la session courante. */
export function useNotifications() {
  const supabase = useSupabaseClient<Database>()
  return {
    listNotifications: (input?: z.input<typeof listNotificationsInputSchema>) => listNotifications(supabase, input),
    markNotificationsRead: (input?: z.input<typeof markNotificationsReadInputSchema>) => markNotificationsRead(supabase, input),
    unreadNotificationsCount: () => unreadNotificationsCount(supabase)
  }
}
