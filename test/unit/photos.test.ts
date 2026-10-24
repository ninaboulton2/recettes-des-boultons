import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { collectPhotoPaths } from '../../server/utils/accountDeletion'
import {
  copyRecipeWithPhoto,
  isPhotoOfRecipe,
  photoExtension,
  photoPathParts,
  removeRecipeFolder,
  removeReplacedPhoto,
  signSharedPhoto,
  SHARED_PHOTO_SIGNED_SECONDS,
  type CopyWithPhotoPorts
} from '../../server/utils/photos'

const sentry = vi.hoisted(() => ({ captureException: vi.fn() }))
vi.mock('@sentry/nuxt', () => sentry)

const SRC = '11111111-1111-4111-8111-111111111111'
const COPY = '22222222-2222-4222-8222-222222222222'
const TOKEN = '33333333-3333-4333-8333-333333333333'

beforeEach(() => {
  sentry.captureException.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('chemins de photos', () => {
  it('seul `<uuid>/<fichier>` est accepté', () => {
    expect(photoPathParts(`${SRC}/1700000000000.webp`)).toEqual({ recipeId: SRC, file: '1700000000000.webp' })
    for (const bad of [null, undefined, 42, '', 'x', `${SRC}`, `${SRC}/`, `/${SRC}/a.webp`, `${SRC}/../${COPY}/a.webp`, `${SRC}/sous/a.webp`, `${SRC}/..`, 'pas-un-uuid/a.webp', `${SRC}/a b.webp`, `${SRC}/a.webp?x=1`]) {
      expect(photoPathParts(bad)).toBeNull()
    }
  })
  it('isPhotoOfRecipe : le dossier doit être celui de la recette', () => {
    expect(isPhotoOfRecipe(`${SRC}/a.webp`, SRC)).toBe(true)
    expect(isPhotoOfRecipe(`${SRC}/a.webp`, COPY)).toBe(false)
    expect(isPhotoOfRecipe(`${COPY}/../${SRC}/a.webp`, SRC)).toBe(false)
  })
  it('photoExtension', () => {
    expect(photoExtension('a.WEBP')).toBe('webp')
    expect(photoExtension('a.jpg')).toBe('jpg')
    expect(photoExtension('sansextension')).toBe('webp')
  })
})

describe('page publique : URL signée à partir du jeton', () => {
  const ports = (path: string | null, error: { message: string } | null = null) => {
    const photoPath = vi.fn(async () => ({ data: path, error }))
    const sign = vi.fn(async (p: string) => ({ data: { signedUrl: `https://s.test/${p}?token=abc` }, error: null }))
    return { photoPath, sign }
  }

  it('jeton valide : le chemin vient de la base, l\'URL est signée 2 minutes', async () => {
    const p = ports(`${SRC}/a.webp`)
    expect(await signSharedPhoto(p, TOKEN)).toBe(`https://s.test/${SRC}/a.webp?token=abc`)
    expect(p.photoPath).toHaveBeenCalledWith(TOKEN)
    expect(p.sign).toHaveBeenCalledWith(`${SRC}/a.webp`, SHARED_PHOTO_SIGNED_SECONDS)
    expect(SHARED_PHOTO_SIGNED_SECONDS).toBeLessThanOrEqual(120)
  })

  it('jeton mal formé, chemin client, injection : null, la base n\'est même pas interrogée, rien n\'est signé', async () => {
    for (const bad of [undefined, null, '', 'abc', `${SRC}/a.webp`, `${TOKEN}/../x`, '../../etc', { token: TOKEN }, 12]) {
      const p = ports(`${SRC}/a.webp`)
      expect(await signSharedPhoto(p, bad)).toBeNull()
      expect(p.photoPath).not.toHaveBeenCalled()
      expect(p.sign).not.toHaveBeenCalled()
    }
  })

  it('jeton inconnu ou révoqué, ou recette sans photo (NULL) : null, rien n\'est signé', async () => {
    const p = ports(null)
    expect(await signSharedPhoto(p, TOKEN)).toBeNull()
    expect(p.sign).not.toHaveBeenCalled()
  })

  it('un chemin anormal en base n\'est jamais signé', async () => {
    const p = ports('../autre-bucket/secret.webp')
    expect(await signSharedPhoto(p, TOKEN)).toBeNull()
    expect(p.sign).not.toHaveBeenCalled()
  })

  it('la signature échoue (objet absent) : null ; l\'erreur de la base est relancée (500 côté route)', async () => {
    const p = ports(`${SRC}/a.webp`)
    p.sign.mockResolvedValueOnce({ data: null as never, error: { message: 'Object not found' } as never })
    expect(await signSharedPhoto(p, TOKEN)).toBeNull()
    await expect(signSharedPhoto(ports(null, { message: 'boom' }), TOKEN)).rejects.toEqual({ message: 'boom' })
  })

  it('la route ne lit jamais la requête (ni query, ni corps, ni en-tête) hormis le jeton du chemin', () => {
    const source = readFileSync(resolve(process.cwd(), 'server/api/v2/shared/[token]/photo.get.ts'), 'utf8')
    expect(source).not.toMatch(/getQuery|readBody|readValidatedBody|getValidatedQuery|getRequestURL|getHeader/)
    expect(source).toMatch(/getRouterParam\(event, 'token'\)/)
    expect(source).toMatch(/isV2Enabled/)
  })
})

describe('copie d\'une recette avec sa photo', () => {
  function ports(overrides: Partial<CopyWithPhotoPorts> = {}) {
    const calls: string[] = []
    const base: CopyWithPhotoPorts = {
      copyRecipe: async (id) => { calls.push(`copy:${id}`); return { data: COPY, error: null } },
      sourcePhotoPath: async (id) => { calls.push(`read:${id}`); return { data: `${SRC}/1700.webp`, error: null } },
      copyObject: async (from, to) => { calls.push(`object:${from}->${to}`); return { error: null } },
      setPhotoPath: async (id, path) => { calls.push(`set:${id}:${path}`); return { error: null } },
      removeObject: async (path) => { calls.push(`remove:${path}`); return { error: null } }
    }
    return { ports: { ...base, ...overrides }, calls }
  }

  it('la copie a SA photo : objet copié sous le dossier de la copie, photo_path renseigné', async () => {
    const { ports: p, calls } = ports()
    expect(await copyRecipeWithPhoto(p, SRC, () => 1800)).toEqual({ id: COPY, photoCopied: true })
    expect(calls).toEqual([`copy:${SRC}`, `read:${SRC}`, `object:${SRC}/1700.webp->${COPY}/1800.webp`, `set:${COPY}:${COPY}/1800.webp`])
  })

  it('droit de copie refusé : l\'erreur de copy_recipe est relancée, aucun objet touché', async () => {
    const denied = { code: '42501', message: 'Copie impossible' }
    const { ports: p, calls } = ports({ copyRecipe: async () => ({ data: null, error: denied }) })
    await expect(copyRecipeWithPhoto(p, SRC)).rejects.toBe(denied)
    expect(calls).toEqual([])
  })

  it('recette sans photo : copiée, aucun objet touché', async () => {
    const { ports: p, calls } = ports({ sourcePhotoPath: async () => ({ data: null, error: null }) })
    expect(await copyRecipeWithPhoto(p, SRC)).toEqual({ id: COPY, photoCopied: false })
    expect(calls.some(c => c.startsWith('object:'))).toBe(false)
  })

  it('photo_path de la source hors de son dossier : rien n\'est copié (la copie de la recette reste)', async () => {
    const { ports: p, calls } = ports({ sourcePhotoPath: async () => ({ data: `${COPY}/volee.webp`, error: null }) })
    expect(await copyRecipeWithPhoto(p, SRC)).toEqual({ id: COPY, photoCopied: false })
    expect(calls.some(c => c.startsWith('object:') || c.startsWith('set:'))).toBe(false)
    expect(sentry.captureException).toHaveBeenCalled()
  })

  it('l\'objet est introuvable ou Storage échoue : la recette est copiée sans photo, l\'échec est journalisé', async () => {
    const { ports: p, calls } = ports({ copyObject: async () => ({ error: { message: 'Object not found' } }) })
    expect(await copyRecipeWithPhoto(p, SRC)).toEqual({ id: COPY, photoCopied: false })
    expect(calls.some(c => c.startsWith('set:'))).toBe(false)
    expect(sentry.captureException).toHaveBeenCalled()
  })

  it('la base refuse photo_path : l\'objet copié est retiré (pas d\'orphelin)', async () => {
    const { ports: p, calls } = ports({ setPhotoPath: async () => ({ error: { message: 'contrainte' } }) })
    expect(await copyRecipeWithPhoto(p, SRC, () => 1800)).toEqual({ id: COPY, photoCopied: false })
    expect(calls).toContain(`remove:${COPY}/1800.webp`)
  })
})

describe('nettoyage', () => {
  it('remplacement : l\'ancien objet est supprimé, seulement s\'il est dans le dossier de la recette et différent du nouveau', async () => {
    const remove = vi.fn(async () => ({ error: null }))
    expect(await removeReplacedPhoto({ remove }, SRC, `${SRC}/old.webp`, `${SRC}/new.webp`)).toBe(true)
    expect(remove).toHaveBeenLastCalledWith([`${SRC}/old.webp`])
    expect(await removeReplacedPhoto({ remove }, SRC, `${SRC}/old.webp`, null)).toBe(true)
    remove.mockClear()
    expect(await removeReplacedPhoto({ remove }, SRC, `${SRC}/same.webp`, `${SRC}/same.webp`)).toBe(false)
    expect(await removeReplacedPhoto({ remove }, SRC, null, `${SRC}/new.webp`)).toBe(false)
    expect(await removeReplacedPhoto({ remove }, SRC, `${COPY}/autre.webp`, null)).toBe(false)
    expect(await removeReplacedPhoto({ remove }, SRC, '../x.webp', null)).toBe(false)
    expect(remove).not.toHaveBeenCalled()
  })

  it('remplacement : un échec de Storage est journalisé, sans exception', async () => {
    const remove = vi.fn(async () => ({ error: { message: 'boom' } }))
    expect(await removeReplacedPhoto({ remove }, SRC, `${SRC}/old.webp`, null)).toBe(false)
    expect(sentry.captureException).toHaveBeenCalled()
  })

  it('suppression d\'une recette : tout le dossier <id>/ est vidé (pagination), pas les dossiers ni le marqueur', async () => {
    const files = Array.from({ length: 130 }, (_, i) => ({ name: `f${i}.webp`, id: `id${i}` }))
    const list = vi.fn(async (_id: string, offset: number, limit: number) => ({
      data: [...files, { name: '.emptyFolderPlaceholder', id: 'm' }, { name: 'sous', id: null }].slice(offset, offset + limit),
      error: null
    }))
    const remove = vi.fn(async () => ({ error: null }))
    expect(await removeRecipeFolder({ list, remove }, SRC)).toBe(130)
    expect(list).toHaveBeenCalledWith(SRC, 0, 100)
    expect(list).toHaveBeenCalledWith(SRC, 100, 100)
    const removed = remove.mock.calls.flatMap(call => call[0] as string[])
    expect(removed).toHaveLength(130)
    expect(removed.every(path => path.startsWith(`${SRC}/f`))).toBe(true)
  })

  it('suppression : identifiant invalide = rien ; échec de Storage = journalisé, jamais d\'exception', async () => {
    const remove = vi.fn(async () => ({ error: null }))
    const list = vi.fn(async () => ({ data: [], error: null }))
    expect(await removeRecipeFolder({ list, remove }, '../..')).toBe(0)
    expect(list).not.toHaveBeenCalled()
    const failing = vi.fn(async () => ({ data: null, error: { message: 'boom' } }))
    expect(await removeRecipeFolder({ list: failing, remove }, SRC)).toBe(0)
    expect(sentry.captureException).toHaveBeenCalled()
  })

  it('suppression de compte : le nettoyage par préfixe couvre aussi les photos posées par d\'autres éditeurs dans le dossier d\'une recette', async () => {
    // collectPhotoPaths liste TOUT le dossier `<recette>/` (pas seulement recipes.photo_path) : un ancien fichier orphelin est retiré aussi
    const paths = await collectPhotoPaths({
      recipeIds: async from => ({ data: from === 0 ? [{ id: SRC }] : [], error: null }),
      listPhotos: async () => ({ data: [{ name: 'courante.webp', id: 'a' }, { name: 'ancienne-orpheline.webp', id: 'b' }], error: null })
    })
    expect(paths).toEqual([`${SRC}/courante.webp`, `${SRC}/ancienne-orpheline.webp`])
  })
})
