/**
 * Préparation des photos avant envoi au traducteur (`POST /api/extract-recipe`).
 *
 * Une photo de téléphone pèse 3 à 8 Mo ; la requête est limitée à 4 Mo (Vercel
 * refuse plus de 4,5 Mo) et le modèle n'a pas besoin de 12 mégapixels pour lire
 * une page de livre. L'image est donc redessinée (orientation EXIF appliquée,
 * fond blanc pour les PNG transparents) en JPEG de 2 000 px au plus, puis
 * recompressée jusqu'à tenir dans `IMAGE_TARGET_BYTES`.
 */

/** Plus grand côté conservé (pixels). */
export const IMAGE_MAX_EDGE = 2000
/** Poids visé par image (octets) : 4 images tiennent dans les 4 Mo d'une requête. */
export const IMAGE_TARGET_BYTES = 900 * 1024

const QUALITY_STEPS = [0.85, 0.75, 0.65, 0.55]

/** Dimensions réduites pour que le plus grand côté ne dépasse pas `maxEdge` (jamais d'agrandissement). */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number, height: number } {
  const longest = Math.max(width, height)
  if (longest <= maxEdge) return { width, height }
  const ratio = maxEdge / longest
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) }
}

/** `photo.HEIC` → `photo.jpg`. */
export function jpegName(name: string): string {
  const dot = name.lastIndexOf('.')
  return `${dot > 0 ? name.slice(0, dot) : name}.jpg`
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Encodage JPEG impossible'))), 'image/jpeg', quality)
  })
}

/**
 * Renvoie un JPEG allégé (ou le fichier d'origine s'il est déjà un JPEG assez
 * petit). Lève une erreur si le navigateur ne sait pas décoder l'image
 * (ex. HEIC hors Safari) : l'appelant affiche alors « image illisible ».
 */
export async function prepareImageForUpload(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file)
  try {
    const alreadySmall = file.type === 'image/jpeg'
      && file.size <= IMAGE_TARGET_BYTES
      && Math.max(bitmap.width, bitmap.height) <= IMAGE_MAX_EDGE
    if (alreadySmall) return file

    let edge = IMAGE_MAX_EDGE
    let blob: Blob | null = null
    for (let pass = 0; pass < 2; pass++) {
      const { width, height } = fitWithin(bitmap.width, bitmap.height, edge)
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Canvas indisponible')
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, width, height)
      context.drawImage(bitmap, 0, 0, width, height)
      for (const quality of QUALITY_STEPS) {
        blob = await canvasToJpeg(canvas, quality)
        if (blob.size <= IMAGE_TARGET_BYTES) break
      }
      if (blob && blob.size <= IMAGE_TARGET_BYTES) break
      // Toujours trop lourde à qualité minimale : on réduit aussi les dimensions.
      edge = Math.round(edge * 0.75)
    }
    if (!blob) throw new Error('Encodage JPEG impossible')
    return new File([blob], jpegName(file.name), { type: 'image/jpeg', lastModified: file.lastModified })
  } finally {
    bitmap.close()
  }
}
