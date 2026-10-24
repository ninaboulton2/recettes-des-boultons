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
 *  2. chemins des photos de ses recettes (service_role) : on liste le bucket par préfixe `<id de la recette>/`, avec pagination
 *     (les recettes sont lues par pages de 1000, les dossiers par pages de 100), plutôt que de lire `recipes.photo_path` (une seule
 *     requête PostgREST est plafonnée à 1000 lignes). À retirer du bucket APRÈS la suppression ;
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
  /** Page d'identifiants de recettes dont elle est l'auteur (service_role) : lignes `from` à `to` incluses, triées par id. */
  recipeIds: (from: number, to: number) => PromiseLike<Result<Array<{ id: string }>>>
  /** `storage.from('recipe-photos').list(recipeId, { limit, offset })` (service_role) : fichiers du dossier de la recette. */
  listPhotos: (recipeId: string, offset: number, limit: number) => PromiseLike<Result<Array<{ name: string, id?: string | null }>>>
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

const RECIPE_PAGE = 1000
const PHOTO_PAGE = 100
const REMOVE_CHUNK = 100
const LIST_CONCURRENCY = 10

/** Tous les chemins `<recette>/<fichier>` du bucket pour les recettes de la personne (pagination des deux listes). */
export async function collectPhotoPaths(ports: Pick<AccountDeletionPorts, 'recipeIds' | 'listPhotos'>): Promise<string[]> {
  const paths: string[] = []
  for (let from = 0; ; from += RECIPE_PAGE) {
    const page = await ports.recipeIds(from, from + RECIPE_PAGE - 1)
    if (page.error) throwSupabaseError(page.error, 'account-delete recipes')
    const ids = (page.data ?? []).map(row => row.id)
    for (let i = 0; i < ids.length; i += LIST_CONCURRENCY) {
      const batch = ids.slice(i, i + LIST_CONCURRENCY)
      const lists = await Promise.all(batch.map(async (recipeId) => {
        const names: string[] = []
        for (let offset = 0; ; offset += PHOTO_PAGE) {
          const files = await ports.listPhotos(recipeId, offset, PHOTO_PAGE)
          if (files.error) throwSupabaseError(files.error, 'account-delete photos')
          const rows = files.data ?? []
          // un « dossier » (sans `id`) ou le marqueur de dossier vide ne sont pas des photos
          for (const file of rows) {
            if (file.id !== null && file.name !== '.emptyFolderPlaceholder') names.push(`${recipeId}/${file.name}`)
          }
          if (rows.length < PHOTO_PAGE) break
        }
        return names
      }))
      for (const names of lists) paths.push(...names)
    }
    if (ids.length < RECIPE_PAGE) break
  }
  return paths
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

  const paths = await collectPhotoPaths(ports)

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
      for (let i = 0; i < paths.length; i += REMOVE_CHUNK) {
        const chunk = paths.slice(i, i + REMOVE_CHUNK)
        const removed = await ports.removePhotos(chunk)
        if (removed.error) throw new Error(removed.error.message ?? 'suppression des photos refusée')
        removedPhotos += chunk.length
      }
    } catch (error) {
      // le compte est déjà supprimé : on journalise pour un nettoyage manuel, sans renvoyer d'erreur
      console.error('[api] account-delete photos', error)
      Sentry.captureException(error, { tags: { api: 'account-delete photos' } })
    }
  }
  return { deletedGroups: prepared.data ?? 0, removedPhotos }
}
