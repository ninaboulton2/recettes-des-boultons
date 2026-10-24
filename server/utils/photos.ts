import * as Sentry from '@sentry/nuxt'
import { uuidSchema } from '#shared/schemas/common'

/**
 * Photos privées (phase 8) — logique pure des routes serveur, testable sans Nuxt ni Supabase : les routes fournissent les
 * « ports » (appels Supabase réels), les tests des faux.
 *
 * Règle d'or : un chemin de photo ne vient JAMAIS du client. On le lit en base (`recipes.photo_path` avec la session de la
 * personne, ou `shared_recipe_photo_path(jeton)` avec la clé service_role), puis on le revérifie (`photoPathParts`) avant
 * toute copie, suppression ou signature faite avec la clé service_role (qui contourne le RLS).
 */

export const RECIPE_PHOTO_BUCKET = 'recipe-photos'
/** Durée de l'URL signée servie à la page publique (le navigateur la suit aussitôt ; elle ne sert qu'une fois). */
export const SHARED_PHOTO_SIGNED_SECONDS = 120
/** Durée pendant laquelle le navigateur peut réutiliser la redirection (doit rester < durée de l'URL signée). */
export const SHARED_PHOTO_REDIRECT_CACHE_SECONDS = 60

const FILE_NAME = /^[A-Za-z0-9._-]{1,120}$/

type Failure = { message?: string | null } | null

/** `<id de recette>/<fichier>` : le seul format accepté (jamais de `..`, de sous-dossier ni d'autre dossier). */
export function photoPathParts(path: unknown): { recipeId: string, file: string } | null {
  if (typeof path !== 'string') return null
  const slash = path.indexOf('/')
  if (slash <= 0) return null
  const recipeId = path.slice(0, slash)
  const file = path.slice(slash + 1)
  if (!uuidSchema.safeParse(recipeId).success || !FILE_NAME.test(file) || file === '.' || file === '..') return null
  return { recipeId: recipeId.toLowerCase(), file }
}

/** Le chemin est bien un fichier du dossier de CETTE recette. */
export function isPhotoOfRecipe(path: unknown, recipeId: string): boolean {
  return photoPathParts(path)?.recipeId === recipeId.toLowerCase()
}

/** Extension (minuscule, sans point) d'un nom de fichier de photo ; `webp` par défaut. */
export function photoExtension(file: string): string {
  const match = /\.([A-Za-z0-9]{2,5})$/.exec(file)
  return match?.[1] ? match[1].toLowerCase() : 'webp'
}

function logFailure(context: string, error: unknown): void {
  console.error(`[api] ${context}`, error)
  Sentry.captureException(error, { tags: { api: context } })
}

// ---------------------------------------------------------------------------- page publique

export interface SharedPhotoPorts {
  /** `rpc('shared_recipe_photo_path', { p_token })` (service_role) : chemin, ou NULL (jeton inconnu / sans photo). */
  photoPath: (token: string) => PromiseLike<{ data: string | null, error: Failure }>
  /** `storage.from('recipe-photos').createSignedUrl(path, seconds)` (service_role). */
  sign: (path: string, seconds: number) => PromiseLike<{ data: { signedUrl: string } | null, error: Failure }>
}

/**
 * URL signée courte de la photo derrière un jeton de lien public, ou `null` (jeton mal formé, inconnu, révoqué, recette sans
 * photo : même réponse, rien n'est révélé). Le chemin vient de la base, jamais de la requête.
 */
export async function signSharedPhoto(ports: SharedPhotoPorts, token: unknown): Promise<string | null> {
  const parsed = uuidSchema.safeParse(token)
  if (!parsed.success) return null
  const found = await ports.photoPath(parsed.data)
  if (found.error) throw found.error
  if (!photoPathParts(found.data)) return null
  const signed = await ports.sign(found.data as string, SHARED_PHOTO_SIGNED_SECONDS)
  if (signed.error || !signed.data?.signedUrl) return null
  return signed.data.signedUrl
}

// ---------------------------------------------------------------------------- copie d'une recette avec sa photo

export interface CopyWithPhotoPorts {
  /** `rpc('copy_recipe', { p_source })` avec la session de la personne : refuse (42501) si elle ne peut pas copier. */
  copyRecipe: (sourceId: string) => PromiseLike<{ data: string | null, error: { code?: string | null, message?: string | null } | null }>
  /** `recipes.photo_path` de la source, lu AVEC la session de la personne (RLS : elle la lit forcément, puisqu'elle l'a copiée). */
  sourcePhotoPath: (sourceId: string) => PromiseLike<{ data: string | null, error: Failure }>
  /** `storage.from('recipe-photos').copy(from, to)` (service_role). */
  copyObject: (from: string, to: string) => PromiseLike<{ error: Failure }>
  /** `update recipes set photo_path = … where id = copie and owner_id = la personne` (service_role). */
  setPhotoPath: (copyId: string, path: string) => PromiseLike<{ error: Failure }>
  /** `storage.from('recipe-photos').remove([path])` (service_role) : défait la copie d'objet si la base refuse. */
  removeObject: (path: string) => PromiseLike<{ error: Failure }>
}

export interface CopyWithPhotoResult {
  id: string
  /** `true` : la copie a sa propre photo (objet copié sous `<id de la copie>/…`). */
  photoCopied: boolean
}

/**
 * `copy_recipe` (qui vérifie le droit de copier, et copie tout sauf la photo), puis la photo : objet copié sous le dossier de la
 * NOUVELLE recette, `photo_path` renseigné. La copie de la photo est « au mieux » : si elle échoue (objet absent, Storage
 * indisponible), la recette est copiée quand même et `photoCopied` vaut `false` (l'échec est journalisé).
 * L'erreur de `copy_recipe` est renvoyée telle quelle à l'appelant (la route la traduit).
 */
export async function copyRecipeWithPhoto(
  ports: CopyWithPhotoPorts,
  sourceId: string,
  now: () => number = Date.now
): Promise<CopyWithPhotoResult> {
  const copied = await ports.copyRecipe(sourceId)
  if (copied.error) throw copied.error
  const copyId = copied.data
  if (!copyId) throw new Error('copy_recipe n\'a pas renvoyé d\'identifiant')

  try {
    const source = await ports.sourcePhotoPath(sourceId)
    if (source.error) throw source.error
    if (source.data === null || source.data === '') return { id: copyId, photoCopied: false }
    const parts = photoPathParts(source.data)
    // la photo de la source doit être dans le dossier de la source (sinon : donnée anormale, on ne copie rien)
    if (!parts || parts.recipeId !== sourceId.toLowerCase()) throw new Error('photo_path de la source hors de son dossier')
    const target = `${copyId}/${now()}.${photoExtension(parts.file)}`
    const copiedObject = await ports.copyObject(source.data, target)
    if (copiedObject.error) throw copiedObject.error
    const updated = await ports.setPhotoPath(copyId, target)
    if (updated.error) {
      try {
        await ports.removeObject(target)
      } catch {
        // objet orphelin : sans conséquence pour la personne
      }
      throw updated.error
    }
    return { id: copyId, photoCopied: true }
  } catch (error) {
    logFailure('copy-recipe photo', error)
    return { id: copyId, photoCopied: false }
  }
}

// ---------------------------------------------------------------------------- nettoyage

export interface RemoveObjectsPort {
  /** `storage.from('recipe-photos').remove(paths)` (service_role). */
  remove: (paths: string[]) => PromiseLike<{ error: Failure }>
}

export interface ListFolderPort {
  /** `storage.from('recipe-photos').list(recipeId, { limit, offset })` (service_role). */
  list: (recipeId: string, offset: number, limit: number) => PromiseLike<{ data: Array<{ name: string, id?: string | null }> | null, error: Failure }>
}

/**
 * Remplacement ou retrait d'une photo : l'ancien objet est supprimé APRÈS l'enregistrement réussi, seulement s'il est bien dans le
 * dossier de la recette et différent du nouveau. « Au mieux » : un échec est journalisé, il n'annule pas l'enregistrement.
 * Renvoie `true` si un objet a été retiré.
 */
export async function removeReplacedPhoto(
  ports: RemoveObjectsPort,
  recipeId: string,
  previous: string | null | undefined,
  next: string | null | undefined
): Promise<boolean> {
  if (!previous || previous === next || !isPhotoOfRecipe(previous, recipeId)) return false
  try {
    const removed = await ports.remove([previous])
    if (removed.error) throw removed.error
    return true
  } catch (error) {
    logFailure('photo replaced cleanup', error)
    return false
  }
}

const FOLDER_PAGE = 100

/**
 * Suppression d'une recette : toutes les photos de son dossier (`<id>/…`) sont retirées du bucket, après la suppression
 * de la ligne (jamais avant : une suppression refusée ne doit pas faire perdre la photo). « Au mieux » : échec journalisé.
 * Renvoie le nombre d'objets retirés.
 */
export async function removeRecipeFolder(ports: ListFolderPort & RemoveObjectsPort, recipeId: string): Promise<number> {
  if (!uuidSchema.safeParse(recipeId).success) return 0
  try {
    const paths: string[] = []
    for (let offset = 0; ; offset += FOLDER_PAGE) {
      const page = await ports.list(recipeId, offset, FOLDER_PAGE)
      if (page.error) throw page.error
      const rows = page.data ?? []
      for (const file of rows) {
        if (file.id !== null && file.id !== undefined && file.name !== '.emptyFolderPlaceholder') paths.push(`${recipeId}/${file.name}`)
      }
      if (rows.length < FOLDER_PAGE) break
    }
    for (let i = 0; i < paths.length; i += FOLDER_PAGE) {
      const removed = await ports.remove(paths.slice(i, i + FOLDER_PAGE))
      if (removed.error) throw removed.error
    }
    return paths.length
  } catch (error) {
    logFailure('recipe photos cleanup', error)
    return 0
  }
}
