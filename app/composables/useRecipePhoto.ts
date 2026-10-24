import { toValue, watch, ref, type MaybeRefOrGetter, type Ref } from 'vue'
import { translateKey } from './useApiError'
import type { Database } from '#shared/types/database'
import { createSignedUrlResolver } from '~/utils/signedPhotoUrls'

/** Bucket Storage des photos de recettes (migration 0010) : public en v1, PRIVÉ en v2 après la bascule `v2/0029` (URL signées). */
export const RECIPE_PHOTO_BUCKET = 'recipe-photos'
/** Plus grand côté après redimensionnement (le plan Supabase gratuit n'a pas de transformation d'images). */
export const RECIPE_PHOTO_MAX_DIMENSION = 1600
export const RECIPE_PHOTO_WEBP_QUALITY = 0.82
const JPEG_FALLBACK_QUALITY = 0.85
export const RECIPE_PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp'

export interface ResizedImage {
  blob: Blob
  contentType: 'image/webp' | 'image/jpeg'
  extension: 'webp' | 'jpg'
  width: number
  height: number
}

/** Dimensions cibles : réduit pour tenir dans `max` × `max`, jamais agrandi. */
export function fitDimensions(width: number, height: number, max = RECIPE_PHOTO_MAX_DIMENSION): { width: number, height: number } {
  const largest = Math.max(width, height)
  if (largest <= max) return { width, height }
  const ratio = max / largest
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) }
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      // `imageOrientation: 'from-image'` applique l'orientation EXIF des photos de téléphone.
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // Format non géré par createImageBitmap : repli sur <img>.
    }
  }
  const url = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('Image illisible'))
      image.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality))
}

/**
 * Redimensionne une image côté client (canvas, max 1600 px) et l'encode en
 * WebP (qualité 0,82) ; repli JPEG si le navigateur n'encode pas le WebP.
 */
export async function resizeRecipeImage(file: File): Promise<ResizedImage> {
  const source = await loadBitmap(file)
  const sourceWidth = 'naturalWidth' in source ? source.naturalWidth : source.width
  const sourceHeight = 'naturalHeight' in source ? source.naturalHeight : source.height
  const { width, height } = fitDimensions(sourceWidth, sourceHeight)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas indisponible')
  context.drawImage(source, 0, 0, width, height)
  if ('close' in source) source.close()

  const webp = await canvasToBlob(canvas, 'image/webp', RECIPE_PHOTO_WEBP_QUALITY)
  if (webp && webp.type === 'image/webp') {
    return { blob: webp, contentType: 'image/webp', extension: 'webp', width, height }
  }
  const jpeg = await canvasToBlob(canvas, 'image/jpeg', JPEG_FALLBACK_QUALITY)
  if (!jpeg) throw new Error(translateKey('editor.toasts.photoError', 'Encodage de l\'image impossible'))
  return { blob: jpeg, contentType: 'image/jpeg', extension: 'jpg', width, height }
}

type PhotoClient = ReturnType<typeof useSupabaseClient<Database>>

/** Un résolveur par onglet (cache partagé entre toutes les cartes) ; `null` côté serveur (rien n'est signé pendant le rendu serveur). */
let resolver: ReturnType<typeof createSignedUrlResolver> | null = null
function signedResolver(supabase: PhotoClient) {
  if (!resolver) {
    resolver = createSignedUrlResolver({
      sign: (paths, ttl) => supabase.storage.from(RECIPE_PHOTO_BUCKET).createSignedUrls(paths, ttl),
      store: (() => {
        try {
          return window.sessionStorage
        } catch {
          return null
        }
      })()
    })
  }
  return resolver
}

/** Oublie les URL signées (déconnexion) : une photo privée ne doit pas rester accessible après la session. */
export function clearSignedPhotoUrls(): void {
  resolver?.clear()
  resolver = null
}

/**
 * Photos de recettes : URL publique (v1) ou signée (v2), redimensionnement client, téléversement
 * dans `recipe-photos/<recipeId>/<timestamp>.webp` et suppression. Les
 * écritures passent par le client Supabase de l'utilisateur (RLS : admin).
 */
export function useRecipePhoto() {
  const supabase = useSupabaseClient<Database>()
  const bucket = () => supabase.storage.from(RECIPE_PHOTO_BUCKET)

  /** URL publique d'un chemin du bucket, `null` sans photo. */
  const publicUrl = (path: string | null | undefined): string | null =>
    path ? bucket().getPublicUrl(path).data.publicUrl : null

  /** Redimensionne puis téléverse ; renvoie le chemin à stocker dans `photoPath`. */
  const uploadPhoto = async (recipeId: string, file: File): Promise<string> => {
    const resized = await resizeRecipeImage(file)
    const path = `${recipeId}/${Date.now()}.${resized.extension}`
    const { error } = await bucket().upload(path, resized.blob, {
      contentType: resized.contentType,
      cacheControl: '31536000',
      upsert: false
    })
    if (error) throw error
    return path
  }

  /** Supprime un objet du bucket (ignore un chemin vide). */
  const removePhoto = async (path: string | null | undefined): Promise<void> => {
    if (!path) return
    const { error } = await bucket().remove([path])
    if (error) throw error
  }

  /** Supprime toutes les photos du dossier d'une recette (avant `delete_recipe`). */
  const removeRecipePhotos = async (recipeId: string): Promise<void> => {
    const { data, error } = await bucket().list(recipeId)
    if (error) throw error
    const paths = (data ?? []).map(object => `${recipeId}/${object.name}`)
    if (paths.length === 0) return
    const { error: removeError } = await bucket().remove(paths)
    if (removeError) throw removeError
  }

  /**
   * v2 : URL signée (1 h) d'un chemin, via le client de la personne (le RLS décide : droit de lecture de la recette). Les demandes
   * de la même courte fenêtre partent en un seul `createSignedUrls`. `null` si refusée ou sans chemin. Navigateur seulement.
   */
  const signedUrl = async (path: string | null | undefined): Promise<string | null> =>
    path && import.meta.client ? signedResolver(supabase).resolve(path) : null

  return { publicUrl, signedUrl, uploadPhoto, removePhoto, removeRecipePhotos, resizeImage: resizeRecipeImage }
}

/**
 * Adresse d'affichage d'une photo de recette, réactive.
 *  - v1 : URL publique du bucket (synchrone, rendue côté serveur comme avant) ;
 *  - v2 : URL signée, obtenue côté navigateur (sans photo affichée avant : l'illustration de repli reste visible, puis la photo
 *    apparaît). Les cartes d'une même liste sont regroupées en un seul appel (`createSignedUrls`).
 */
export function usePhotoSrc(path: MaybeRefOrGetter<string | null | undefined>): Ref<string | null> {
  const { publicUrl, signedUrl } = useRecipePhoto()
  const src = ref<string | null>(null)
  if (!useV2()) {
    watch(() => toValue(path), (value) => { src.value = publicUrl(value) }, { immediate: true })
    return src
  }
  watch(() => toValue(path), async (value) => {
    if (!import.meta.client) return
    src.value = null
    if (!value) return
    const url = await signedUrl(value)
    if (toValue(path) === value) src.value = url
  }, { immediate: true })
  return src
}
