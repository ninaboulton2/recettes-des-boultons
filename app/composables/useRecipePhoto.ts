import { translateKey } from './useApiError'
import type { Database } from '#shared/types/database'

/** Bucket Storage public des photos de recettes (migration 0010). */
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

/**
 * Photos de recettes : URL publique, redimensionnement client, téléversement
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

  return { publicUrl, uploadPhoto, removePhoto, removeRecipePhotos, resizeImage: resizeRecipeImage }
}
