import type { SupabaseClient } from '@supabase/supabase-js'
import type { H3Event } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'

/**
 * Client Supabase avec la clé service_role (`SUPABASE_SECRET_KEY`), SERVEUR SEULEMENT, pour les RPC réservées au serveur de la
 * migration 0028 (alerte de crédit, e-mails). Non typé `Database` : ces fonctions ne sont pas encore dans les types générés.
 * Lève si la clé est absente (les appelants l'attrapent : une alerte manquée ne doit jamais casser une requête).
 */
export function serviceClient(event: H3Event): SupabaseClient {
  return serverSupabaseServiceRole(event) as unknown as SupabaseClient
}
