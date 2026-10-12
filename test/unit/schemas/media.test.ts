import { describe, expect, it } from 'vitest'
import {
  AUDIO_MAX_BYTES,
  AUDIO_MAX_SECONDS,
  classifyRecipeFile,
  extractRecipeFieldsSchema,
  extractRecipeFilesSchema,
  RECIPE_FILE_MAX_BYTES,
  RECIPE_FILES_MAX_COUNT,
  RECIPE_UPLOAD_MAX_BYTES,
  sniffAudioType,
  sniffImageOrPdfType,
  transcribeAudioSchema
} from '#shared/schemas/media'

const bytes = (...values: number[]) => new Uint8Array(values)
const ascii = (text: string) => [...text].map(char => char.charCodeAt(0))

describe('classifyRecipeFile', () => {
  it('reconnaît texte, image et PDF d\'après le type MIME', () => {
    expect(classifyRecipeFile({ name: 'a', type: 'text/plain' })).toBe('text')
    expect(classifyRecipeFile({ name: 'a', type: 'text/markdown' })).toBe('text')
    expect(classifyRecipeFile({ name: 'a', type: 'image/jpeg' })).toBe('image')
    expect(classifyRecipeFile({ name: 'a', type: 'image/heic' })).toBe('image')
    expect(classifyRecipeFile({ name: 'a', type: 'application/pdf' })).toBe('pdf')
    expect(classifyRecipeFile({ name: 'a', type: 'application/pdf; charset=binary' })).toBe('pdf')
  })

  it('se replie sur l\'extension quand le type est vide (.md, .heic, .pdf)', () => {
    expect(classifyRecipeFile({ name: 'gateau.md', type: '' })).toBe('text')
    expect(classifyRecipeFile({ name: 'Gateau.TXT', type: '' })).toBe('text')
    expect(classifyRecipeFile({ name: 'IMG_0012.HEIC', type: '' })).toBe('image')
    expect(classifyRecipeFile({ name: 'livre.pdf', type: '' })).toBe('pdf')
  })

  it('refuse les autres formats', () => {
    expect(classifyRecipeFile({ name: 'x.doc', type: 'application/msword' })).toBeNull()
    expect(classifyRecipeFile({ name: 'x.exe', type: 'application/octet-stream' })).toBeNull()
    expect(classifyRecipeFile({ name: 'x.csv', type: 'text/csv' })).toBeNull()
    expect(classifyRecipeFile({ name: 'x.mp3', type: 'audio/mpeg' })).toBeNull()
    expect(classifyRecipeFile({ name: 'sans-extension', type: '' })).toBeNull()
    // Un type image/pdf mensonger sur une extension texte : le type déclaré prime (le serveur relit l'en-tête).
    expect(classifyRecipeFile({ name: 'x.txt', type: 'application/zip' })).toBeNull()
  })
})

describe('sniffImageOrPdfType', () => {
  it('lit l\'en-tête des octets', () => {
    expect(sniffImageOrPdfType(bytes(0xFF, 0xD8, 0xFF, 0xE0, 0, 0))).toBe('image/jpeg')
    expect(sniffImageOrPdfType(bytes(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0))).toBe('image/png')
    expect(sniffImageOrPdfType(bytes(...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WEBPVP8 ')))).toBe('image/webp')
    expect(sniffImageOrPdfType(bytes(...ascii('%PDF-1.7\n')))).toBe('application/pdf')
  })

  it('refuse le reste (GIF, RIFF non WebP, texte, vide)', () => {
    expect(sniffImageOrPdfType(bytes(...ascii('GIF89a')))).toBeNull()
    expect(sniffImageOrPdfType(bytes(...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WAVEfmt ')))).toBeNull()
    expect(sniffImageOrPdfType(bytes(...ascii('MZ\u0090')))).toBeNull()
    expect(sniffImageOrPdfType(new Uint8Array())).toBeNull()
  })
})

describe('sniffAudioType', () => {
  it('reconnaît WebM (Chrome), MP4 (Safari), Ogg, WAV et MP3', () => {
    expect(sniffAudioType(bytes(0x1A, 0x45, 0xDF, 0xA3, 0x9F, 0x42))).toBe('audio/webm')
    expect(sniffAudioType(bytes(0, 0, 0, 0x20, ...ascii('ftypisom')))).toBe('audio/mp4')
    expect(sniffAudioType(bytes(...ascii('OggS'), 0))).toBe('audio/ogg')
    expect(sniffAudioType(bytes(...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WAVEfmt ')))).toBe('audio/wav')
    expect(sniffAudioType(bytes(...ascii('ID3'), 4, 0))).toBe('audio/mpeg')
    expect(sniffAudioType(bytes(0xFF, 0xFB, 0x90, 0))).toBe('audio/mpeg')
  })

  it('refuse une image, un PDF ou un fichier vide', () => {
    expect(sniffAudioType(bytes(0xFF, 0xD8, 0xFF, 0xE0))).toBeNull()
    expect(sniffAudioType(bytes(...ascii('%PDF-1.4')))).toBeNull()
    expect(sniffAudioType(new Uint8Array())).toBeNull()
  })
})

const file = (overrides: Partial<{ filename: string, mediaType: string, size: number }> = {}) =>
  ({ filename: 'page.jpg', mediaType: 'image/jpeg', size: 500_000, ...overrides })

describe('extractRecipeFilesSchema', () => {
  it('accepte 1 à 4 fichiers dans les limites', () => {
    expect(extractRecipeFilesSchema.safeParse([file()]).success).toBe(true)
    expect(extractRecipeFilesSchema.safeParse(Array.from({ length: RECIPE_FILES_MAX_COUNT }, () => file({ size: 900_000 }))).success).toBe(true)
    expect(extractRecipeFilesSchema.safeParse([file({ mediaType: 'application/pdf', filename: 'livre.pdf' })]).success).toBe(true)
  })

  it('refuse 0 fichier et plus de 4 fichiers', () => {
    expect(extractRecipeFilesSchema.safeParse([]).success).toBe(false)
    expect(extractRecipeFilesSchema.safeParse(Array.from({ length: RECIPE_FILES_MAX_COUNT + 1 }, () => file())).success).toBe(false)
  })

  it('refuse un format non pris en charge, un fichier vide ou trop gros', () => {
    expect(extractRecipeFilesSchema.safeParse([file({ mediaType: 'image/gif' })]).success).toBe(false)
    expect(extractRecipeFilesSchema.safeParse([file({ mediaType: 'inconnu' })]).success).toBe(false)
    expect(extractRecipeFilesSchema.safeParse([file({ size: 0 })]).success).toBe(false)
    expect(extractRecipeFilesSchema.safeParse([file({ size: RECIPE_FILE_MAX_BYTES + 1 })]).success).toBe(false)
  })

  it('refuse un total supérieur à la limite de la requête', () => {
    const half = RECIPE_UPLOAD_MAX_BYTES / 2
    expect(extractRecipeFilesSchema.safeParse([file({ size: half }), file({ size: half })]).success).toBe(true)
    const over = extractRecipeFilesSchema.safeParse([file({ size: half }), file({ size: half + 1 })])
    expect(over.success).toBe(false)
    if (!over.success) expect(over.error.issues[0]?.message).toContain('au total')
  })
})

describe('extractRecipeFieldsSchema', () => {
  it('langue fr par défaut, fr|en seulement', () => {
    expect(extractRecipeFieldsSchema.parse({}).targetLanguage).toBe('fr')
    expect(extractRecipeFieldsSchema.parse({ targetLanguage: 'en' }).targetLanguage).toBe('en')
    expect(extractRecipeFieldsSchema.safeParse({ targetLanguage: 'de' }).success).toBe(false)
  })
})

describe('transcribeAudioSchema', () => {
  const audio = (overrides: Partial<{ filename: string, mediaType: string, size: number, durationSeconds: number | null }> = {}) =>
    ({ filename: 'dictee.webm', mediaType: 'audio/webm', size: 1_200_000, durationSeconds: 120, ...overrides })

  it('accepte un enregistrement de 5 minutes au plus (WebM comme MP4)', () => {
    expect(transcribeAudioSchema.safeParse(audio()).success).toBe(true)
    expect(transcribeAudioSchema.safeParse(audio({ mediaType: 'audio/mp4', durationSeconds: AUDIO_MAX_SECONDS })).success).toBe(true)
    expect(transcribeAudioSchema.safeParse(audio({ durationSeconds: null })).success).toBe(true)
  })

  it('refuse un format inconnu, un fichier vide ou trop gros', () => {
    expect(transcribeAudioSchema.safeParse(audio({ mediaType: 'inconnu' })).success).toBe(false)
    expect(transcribeAudioSchema.safeParse(audio({ size: 0 })).success).toBe(false)
    expect(transcribeAudioSchema.safeParse(audio({ size: AUDIO_MAX_BYTES + 1 })).success).toBe(false)
  })

  it('refuse une durée négative ou largement supérieure à 5 minutes', () => {
    expect(transcribeAudioSchema.safeParse(audio({ durationSeconds: -1 })).success).toBe(false)
    expect(transcribeAudioSchema.safeParse(audio({ durationSeconds: AUDIO_MAX_SECONDS + 60 })).success).toBe(false)
    expect(transcribeAudioSchema.safeParse(audio({ durationSeconds: Number.NaN })).success).toBe(false)
  })
})
