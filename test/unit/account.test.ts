import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '#shared/types/database'
import { myPreferencesInputSchema } from '#shared/schemas/social'
import {
  EXPORT_FORMAT_VERSION,
  buildExportFile,
  classifyDeletionError,
  emailMatches,
  exportErrorKey,
  exportFilename,
  hasPasswordLogin
} from '#shared/utils/account'
import { ApiError, isReauthRequired } from '../../app/composables/useApiError'
import { accountDeletionBlockers, exportMyData, updateMyPreferences } from '../../app/composables/useAccount'

describe('fichier d\'export', () => {
  it('nomme le fichier avec la date locale', () => {
    expect(exportFilename(new Date(2026, 0, 5, 23, 59))).toBe('mes-donnees-recettes-2026-01-05.json')
    expect(exportFilename(new Date(2026, 10, 24))).toBe('mes-donnees-recettes-2026-11-24.json')
  })

  it('produit un JSON lisible : indenté, accents conservés, données intactes sous « data »', () => {
    const data = { profile: { display_name: 'Mamie Éléonore' }, recipes: [{ title: 'Gâteau au yaourt', sections: [] }] }
    const file = buildExportFile(data, new Date('2026-10-24T10:00:00Z'))
    expect(file.mime).toContain('application/json')
    expect(file.content).toContain('\n  "data": {')
    expect(file.content).toContain('Gâteau au yaourt')
    expect(file.content).not.toContain('\\u00e2')
    expect(file.content.endsWith('\n')).toBe(true)
    const parsed = JSON.parse(file.content)
    expect(parsed.data).toEqual(data)
    expect(parsed.export).toMatchObject({ generated_at: '2026-10-24T10:00:00.000Z', format_version: EXPORT_FORMAT_VERSION })
  })

  it('accepte un export vide ou null sans casser', () => {
    expect(JSON.parse(buildExportFile(null).content).data).toBeNull()
    expect(JSON.parse(buildExportFile({}).content).data).toEqual({})
  })
})

describe('erreurs d\'export', () => {
  it('54000 = limite des 3 exports du jour', () => {
    expect(exportErrorKey({ code: '54000', message: 'Limite atteinte : 3 exports par jour' })).toBe('settings.export.errors.rate')
  })
  it('tout le reste est générique, jamais le texte de la base', () => {
    expect(exportErrorKey({ code: '42501' })).toBe('errors.generic')
    expect(exportErrorKey(new Error('boom'))).toBe('errors.generic')
    expect(exportErrorKey(null)).toBe('errors.generic')
  })
})

describe('confirmation par l\'adresse e-mail', () => {
  it('ignore la casse et les espaces de bord', () => {
    expect(emailMatches('  Nina@Exemple.FR ', 'nina@exemple.fr')).toBe(true)
  })
  it('refuse une autre adresse, une adresse partielle ou un compte sans adresse', () => {
    expect(emailMatches('nina@exemple.com', 'nina@exemple.fr')).toBe(false)
    expect(emailMatches('nina@exemple', 'nina@exemple.fr')).toBe(false)
    expect(emailMatches('', '')).toBe(false)
    expect(emailMatches('x@y.z', undefined)).toBe(false)
  })
})

describe('échecs de la suppression de compte', () => {
  it('401 REAUTH_REQUIRED : reconnexion demandée', () => {
    const error = new ApiError(401, 'Reconnectez-vous pour confirmer cette action', 'REAUTH_REQUIRED')
    expect(isReauthRequired(error)).toBe(true)
    expect(classifyDeletionError(error)).toEqual({ kind: 'reauth' })
  })
  it('une 401 sans ce code n\'est pas une demande de reconnexion', () => {
    expect(classifyDeletionError(new ApiError(401, 'Non connecté'))).toEqual({ kind: 'generic' })
  })
  it('409 : un groupe est à transférer', () => {
    expect(classifyDeletionError(new ApiError(409, 'Transférez ou supprimez vos groupes avant de supprimer le compte'))).toEqual({ kind: 'blockers' })
  })
  it('400 : adresse différente', () => {
    expect(classifyDeletionError(new ApiError(400, 'L\'adresse e-mail saisie ne correspond pas à votre compte'))).toEqual({ kind: 'mismatch' })
  })
  it('500, réseau, inconnu : générique', () => {
    expect(classifyDeletionError(new ApiError(500, ''))).toEqual({ kind: 'generic' })
    expect(classifyDeletionError(new TypeError('Failed to fetch'))).toEqual({ kind: 'generic' })
    expect(classifyDeletionError(undefined)).toEqual({ kind: 'generic' })
  })
})

describe('mode de reconnexion', () => {
  it('mot de passe si le fournisseur « email » est connu', () => {
    expect(hasPasswordLogin({ app_metadata: { provider: 'email', providers: ['email'] } })).toBe(true)
    expect(hasPasswordLogin({ app_metadata: { providers: ['google', 'email'] } })).toBe(true)
    expect(hasPasswordLogin({ app_metadata: { provider: 'email' } })).toBe(true)
  })
  it('Google seul, ou rien de connu : pas de mot de passe', () => {
    expect(hasPasswordLogin({ app_metadata: { provider: 'google', providers: ['google'] } })).toBe(false)
    expect(hasPasswordLogin({})).toBe(false)
    expect(hasPasswordLogin(null)).toBe(false)
  })
})

describe('préférences (langue, notifications)', () => {
  it('valide la langue et le booléen', () => {
    expect(myPreferencesInputSchema.safeParse({ language: 'en', notifications: false }).success).toBe(true)
    expect(myPreferencesInputSchema.safeParse({ language: 'de', notifications: true }).success).toBe(false)
    expect(myPreferencesInputSchema.safeParse({ language: 'fr' }).success).toBe(false)
  })

  const clientWith = (result: { data: unknown, error: unknown }) => {
    const select = vi.fn().mockResolvedValue(result)
    const eq = vi.fn(() => ({ select }))
    const update = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ update }))
    return { client: { from } as unknown as SupabaseClient<Database>, update, eq, from }
  }

  it('écrit seulement language et notifications dans MA ligne', async () => {
    const { client, update, eq, from } = clientWith({ data: [{ language: 'en', notifications: false }], error: null })
    await expect(updateMyPreferences(client, 'me', { language: 'en', notifications: false })).resolves.toEqual({ language: 'en', notifications: false })
    expect(from).toHaveBeenCalledWith('profiles')
    expect(update).toHaveBeenCalledWith({ language: 'en', notifications: false })
    expect(eq).toHaveBeenCalledWith('id', 'me')
  })
  it('profil introuvable (0 ligne) ou erreur de la base : relance', async () => {
    await expect(updateMyPreferences(clientWith({ data: [], error: null }).client, 'me', { language: 'fr', notifications: true })).rejects.toThrow('Profil introuvable')
    const failure = { code: '42501', message: 'refusé' }
    await expect(updateMyPreferences(clientWith({ data: null, error: failure }).client, 'me', { language: 'fr', notifications: true })).rejects.toBe(failure)
  })
})

describe('export et blocages (RPC)', () => {
  it('exportMyData renvoie les données, relance l\'erreur 54000', async () => {
    const ok = { rpc: vi.fn().mockResolvedValue({ data: { recipes: [] }, error: null }) } as unknown as SupabaseClient<Database>
    await expect(exportMyData(ok)).resolves.toEqual({ recipes: [] })
    const limit = { code: '54000', message: 'Limite atteinte' }
    const ko = { rpc: vi.fn().mockResolvedValue({ data: null, error: limit }) } as unknown as SupabaseClient<Database>
    await expect(exportMyData(ko)).rejects.toBe(limit)
  })

  it('accountDeletionBlockers convertit les groupes à transférer', async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: [{ group_id: 'g1', group_name: 'Les voisins', other_member_count: 2 }], error: null }) } as unknown as SupabaseClient<Database>
    await expect(accountDeletionBlockers(client)).resolves.toEqual([{ groupId: 'g1', groupName: 'Les voisins', otherMemberCount: 2 }])
    const none = { rpc: vi.fn().mockResolvedValue({ data: [], error: null }) } as unknown as SupabaseClient<Database>
    await expect(accountDeletionBlockers(none)).resolves.toEqual([])
  })
})
