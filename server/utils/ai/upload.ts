import { createError, getHeader, readMultipartFormData, type H3Event, type MultiPartData } from 'h3'

/**
 * Lecture des envois multipart (`FormData` du navigateur) des endpoints média.
 *
 * Le corps est lu en mémoire : on refuse d'abord, sur l'en-tête
 * `Content-Length`, tout envoi manifestement trop gros (413) ; la taille
 * exacte de chaque fichier est ensuite validée par Zod (`shared/schemas/media.ts`).
 * Sur Vercel, la plateforme coupe déjà à 4,5 Mo avant d'atteindre la fonction.
 */

/** Place laissée aux séparateurs et en-têtes multipart au-delà des fichiers eux-mêmes. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024

export const UPLOAD_TOO_LARGE_MESSAGE = (maxBytes: number) =>
  `Envoi trop volumineux (max ${Math.round(maxBytes / (1024 * 1024))} Mo). Réduisez la taille des fichiers ou envoyez moins d'images.`

export async function readUploadParts(event: H3Event, maxBytes: number): Promise<MultiPartData[]> {
  const declared = Number(getHeader(event, 'content-length'))
  if (Number.isFinite(declared) && declared > maxBytes + MULTIPART_OVERHEAD_BYTES) {
    throw createError({ statusCode: 413, statusMessage: UPLOAD_TOO_LARGE_MESSAGE(maxBytes) })
  }
  let parts: MultiPartData[] | undefined
  try {
    parts = await readMultipartFormData(event)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Envoi illisible (multipart/form-data attendu)' })
  }
  if (!parts) {
    throw createError({ statusCode: 400, statusMessage: 'Envoi manquant (multipart/form-data attendu)' })
  }
  return parts
}

/** Valeur texte d'un champ simple du formulaire (`undefined` si absent). */
export function textField(parts: MultiPartData[], name: string): string | undefined {
  const part = parts.find(candidate => candidate.name === name && candidate.filename === undefined)
  return part ? part.data.toString('utf8') : undefined
}

/** Parties « fichier » portant ce nom de champ, dans l'ordre d'envoi. */
export function fileParts(parts: MultiPartData[], name: string): MultiPartData[] {
  return parts.filter(candidate => candidate.name === name && candidate.filename !== undefined)
}
