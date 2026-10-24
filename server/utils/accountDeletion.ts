import { createError } from 'h3'
import * as Sentry from '@sentry/nuxt'
import { throwSupabaseError, type SupabaseErrorLike } from './errors'

/**
 * Suppression de compte (dossier §7.4, migration 0023) — logique pure, testable sans Nuxt ni Supabase : la route
 * `server/api/account/delete.post.ts` fournit les « ports » (appels réels), les tests des faux.
 *
 * Déroulé :
 *  1. `account_deletion_blockers()` (avec la session de la personne) : tout groupe qu'elle CRÉE et qui a d'autres membres
 *     bloque la suppression → 409 avec la liste (à transférer ou supprimer d'abord) ;
 *  2. chemins des photos de ses recettes (service_role) : à retirer du bucket APRÈS la suppression ;
 *  3. `prepare_account_deletion(user)` (service_role) : contrôle à nouveau sous verrou (personne n'a rejoint entre-temps)
 *     et supprime les groupes où elle est seule — sinon `groups.created_by on delete restrict` bloquerait ;
 *  4. `auth.admin.deleteUser` (service_role) : la cascade supprime profil, recettes, carnet, favoris, planning, courses,
 *     relations ; les copies faites par d'autres leur restent ; les personnes qui avaient ses recettes « telles quelles »
 *     reçoivent une notification (déclencheur de la migration 0023) ;
 *  5. photos retirées du bucket (meilleur effort : un échec est journalisé, il ne défait pas la suppression).
 * Si 4 échoue, le compte reste (les groupes où elle était seule ont pu être supprimés : sans conséquence).
 */

type Result<T> = { data: T | null, error: SupabaseErrorLike | null }

export interface AccountBlockerRow {
  group_id: string
  group_name: string
  other_member_count: number
}

export interface AccountDeletionPorts {
  /** `rpc('account_deletion_blockers')` avec la session de la personne. */
  blockers: () => PromiseLike<Result<AccountBlockerRow[]>>
  /** `recipes.photo_path` des recettes dont elle est l'auteur (service_role). */
  photoPaths: () => PromiseLike<Result<Array<{ photo_path: string | null }>>>
  /** `rpc('prepare_account_deletion', { p_user })` (service_role) : nombre de groupes supprimés. */
  prepare: () => PromiseLike<Result<number>>
  /** `auth.admin.deleteUser(id)` (service_role). */
  deleteAuthUser: () => PromiseLike<{ error: SupabaseErrorLike | null }>
  /** `storage.from('recipe-photos').remove(paths)` (service_role). */
  removePhotos: (paths: string[]) => PromiseLike<{ error: SupabaseErrorLike | null }>
}

export interface AccountDeletionResult {
  deletedGroups: number
  removedPhotos: number
}

const BLOCKED_MESSAGE = 'Transférez ou supprimez vos groupes avant de supprimer le compte'

export async function deleteAccountFlow(ports: AccountDeletionPorts): Promise<AccountDeletionResult> {
  const blockers = await ports.blockers()
  if (blockers.error) throwSupabaseError(blockers.error, 'account-delete blockers')
  if ((blockers.data ?? []).length > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: BLOCKED_MESSAGE,
      data: { blockers: (blockers.data ?? []).map(b => ({ groupId: b.group_id, groupName: b.group_name, otherMemberCount: b.other_member_count })) }
    })
  }

  const photos = await ports.photoPaths()
  if (photos.error) throwSupabaseError(photos.error, 'account-delete photos')
  const paths = (photos.data ?? []).map(row => row.photo_path).filter((p): p is string => typeof p === 'string' && p !== '')

  const prepared = await ports.prepare()
  if (prepared.error) {
    // un groupe a reçu un membre entre le contrôle et le verrou
    if (prepared.error.code === '55000') throw createError({ statusCode: 409, statusMessage: BLOCKED_MESSAGE })
    throwSupabaseError(prepared.error, 'account-delete prepare')
  }

  const deleted = await ports.deleteAuthUser()
  if (deleted.error) throwSupabaseError(deleted.error, 'account-delete deleteUser')

  let removedPhotos = 0
  if (paths.length > 0) {
    try {
      const removed = await ports.removePhotos(paths)
      if (removed.error) throw new Error(removed.error.message ?? 'suppression des photos refusée')
      removedPhotos = paths.length
    } catch (error) {
      // le compte est déjà supprimé : on journalise pour un nettoyage manuel, sans renvoyer d'erreur
      console.error('[api] account-delete photos', error)
      Sentry.captureException(error, { tags: { api: 'account-delete photos' } })
    }
  }
  return { deletedGroups: prepared.data ?? 0, removedPhotos }
}
