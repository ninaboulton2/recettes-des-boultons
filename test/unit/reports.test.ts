import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '#shared/types/database'
import { REPORT_DETAILS_MAX, createReportInputSchema, reportSharedRecipeInputSchema, setReportStatusInputSchema } from '#shared/schemas/reports'
import { reportErrorKey, sortSupportReports, supportActions, toSupportReport } from '#shared/utils/reports'
import { createReport, deleteReportedRecipe, listOpenReports, reportSharedRecipe, setReportStatus } from '../../app/composables/useReports'

const ID = '11111111-1111-4111-8111-111111111111'
const TOKEN = '22222222-2222-4222-8222-222222222222'

describe('schémas de signalement', () => {
  it('accepte les quatre motifs, refuse le reste', () => {
    for (const reason of ['illegal', 'copyright', 'spam', 'other']) expect(createReportInputSchema.safeParse({ recipeId: ID, reason }).success).toBe(true)
    expect(createReportInputSchema.safeParse({ recipeId: ID, reason: 'hate' }).success).toBe(false)
    expect(createReportInputSchema.safeParse({ recipeId: 'x', reason: 'spam' }).success).toBe(false)
  })
  it('détails : 2000 caractères au plus, espaces de bord retirés, vide = absent', () => {
    expect(createReportInputSchema.safeParse({ recipeId: ID, reason: 'spam', details: 'x'.repeat(REPORT_DETAILS_MAX) }).success).toBe(true)
    expect(createReportInputSchema.safeParse({ recipeId: ID, reason: 'spam', details: 'x'.repeat(REPORT_DETAILS_MAX + 1) }).success).toBe(false)
    expect(createReportInputSchema.parse({ recipeId: ID, reason: 'spam', details: '  copié du blog  ' }).details).toBe('copié du blog')
    expect(createReportInputSchema.parse({ recipeId: ID, reason: 'spam', details: '   ' }).details).toBeUndefined()
  })
  it('lien public : jeton UUID', () => {
    expect(reportSharedRecipeInputSchema.safeParse({ token: TOKEN, reason: 'other' }).success).toBe(true)
    expect(reportSharedRecipeInputSchema.safeParse({ token: 'pas-un-jeton', reason: 'other' }).success).toBe(false)
  })
  it('support : trois statuts de traitement seulement', () => {
    expect(setReportStatusInputSchema.safeParse({ reportId: ID, status: 'dismissed' }).success).toBe(true)
    expect(setReportStatusInputSchema.safeParse({ reportId: ID, status: 'open' }).success).toBe(false)
  })
})

describe('reportErrorKey', () => {
  it('54000 = limite de 10 par jour', () => expect(reportErrorKey({ code: '54000', message: 'Limite atteinte : 10 signalements par jour' })).toBe('errors.report.rate'))
  it('lien révoqué, refus, entrée refusée', () => {
    expect(reportErrorKey({ code: 'P0002' })).toBe('errors.report.notFound')
    expect(reportErrorKey({ code: '42501' })).toBe('errors.report.forbidden')
    expect(reportErrorKey({ code: '22023' })).toBe('errors.report.invalid')
    expect(reportErrorKey({ code: '23503' })).toBe('errors.report.invalid')
  })
  it('inconnu : générique', () => {
    expect(reportErrorKey(new Error('x'))).toBe('errors.generic')
    expect(reportErrorKey(undefined)).toBe('errors.generic')
  })
})

describe('écran support', () => {
  const row = (over: Record<string, unknown> = {}) => toSupportReport({
    id: ID, recipe_id: ID, reason: 'spam', details: 'texte', status: 'open', created_at: '2026-10-24T10:00:00Z', handled_at: null,
    recipes: { id: ID, title: 'Tarte' }, ...over
  })
  it('convertit une ligne (recette jointe en objet ou en tableau)', () => {
    expect(row()).toMatchObject({ recipeTitle: 'Tarte', reason: 'spam', status: 'open', details: 'texte' })
    expect(row({ recipes: [{ id: ID, title: 'Gratin' }] }).recipeTitle).toBe('Gratin')
  })
  it('recette supprimée ou illisible, motif ou statut inconnu : valeurs sûres', () => {
    expect(row({ recipe_id: null, recipes: null })).toMatchObject({ recipeId: null, recipeTitle: null })
    expect(row({ reason: 'zzz' }).reason).toBe('unknown')
    expect(row({ status: 'zzz' }).status).toBe('open')
    expect(row({ details: '   ' }).details).toBeNull()
  })
  it('actions selon le statut', () => {
    expect(supportActions('open')).toEqual(['reviewed', 'actioned', 'dismissed'])
    expect(supportActions('reviewed')).toEqual(['actioned', 'dismissed'])
    expect(supportActions('actioned')).toEqual([])
    expect(supportActions('dismissed')).toEqual([])
  })
  it('tri : ouverts d\'abord, plus anciens en tête', () => {
    const sorted = sortSupportReports([
      row({ id: 'b', status: 'reviewed', created_at: '2026-10-01T00:00:00Z' }),
      row({ id: 'c', created_at: '2026-10-03T00:00:00Z' }),
      row({ id: 'a', created_at: '2026-10-02T00:00:00Z' })
    ])
    expect(sorted.map(r => r.id)).toEqual(['a', 'c', 'b'])
  })
})

describe('appels', () => {
  it('createReport insère recipe_id, reporter_id, motif, détails (sans clé details si vide)', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null })
    const client = { from: vi.fn(() => ({ insert })) } as unknown as SupabaseClient<Database>
    await createReport(client, 'me', { recipeId: ID, reason: 'copyright', details: ' blog ' })
    expect(insert).toHaveBeenCalledWith({ recipe_id: ID, reporter_id: 'me', reason: 'copyright', details: 'blog' })
    await createReport(client, 'me', { recipeId: ID, reason: 'spam' })
    expect(insert).toHaveBeenLastCalledWith({ recipe_id: ID, reporter_id: 'me', reason: 'spam' })
  })
  it('createReport relance l\'erreur de limite (54000) et refuse une entrée invalide avant tout appel', async () => {
    const limit = { code: '54000', message: 'x' }
    const client = { from: vi.fn(() => ({ insert: vi.fn().mockResolvedValue({ error: limit }) })) } as unknown as SupabaseClient<Database>
    await expect(createReport(client, 'me', { recipeId: ID, reason: 'spam' })).rejects.toBe(limit)
    const never = { from: vi.fn() } as unknown as SupabaseClient<Database>
    await expect(createReport(never, 'me', { recipeId: ID, reason: 'bad' as never })).rejects.toThrow('Données invalides')
    expect(never.from).not.toHaveBeenCalled()
  })
  it('reportSharedRecipe appelle la RPC de 0027', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: ID, error: null })
    await expect(reportSharedRecipe({ rpc } as unknown as SupabaseClient<Database>, { token: TOKEN, reason: 'illegal', details: 'd' })).resolves.toBe(ID)
    expect(rpc).toHaveBeenCalledWith('report_shared_recipe', { p_token: TOKEN, p_reason: 'illegal', p_details: 'd' })
  })
  it('setReportStatus : 0 ligne = introuvable', async () => {
    const chain = (rows: unknown[]) => ({ from: vi.fn(() => ({ update: vi.fn(() => ({ eq: vi.fn(() => ({ select: vi.fn().mockResolvedValue({ data: rows, error: null }) })) })) })) }) as unknown as SupabaseClient<Database>
    await expect(setReportStatus(chain([{ id: ID }]), { reportId: ID, status: 'actioned' })).resolves.toBeUndefined()
    await expect(setReportStatus(chain([]), { reportId: ID, status: 'actioned' })).rejects.toMatchObject({ code: 'P0002' })
  })
  it('listOpenReports ne demande que les ouverts et examinés', async () => {
    const limit = vi.fn().mockResolvedValue({ data: [{ id: ID, recipe_id: ID, reason: 'spam', details: null, status: 'open', created_at: '2026-10-24T10:00:00Z', handled_at: null, recipes: { id: ID, title: 'T' } }], error: null })
    const inFn = vi.fn(() => ({ order: vi.fn(() => ({ limit })) }))
    const client = { from: vi.fn(() => ({ select: vi.fn(() => ({ in: inFn })) })) } as unknown as SupabaseClient<Database>
    const reports = await listOpenReports(client)
    expect(inFn).toHaveBeenCalledWith('status', ['open', 'reviewed'])
    expect(reports[0]?.recipeTitle).toBe('T')
  })
  it('deleteReportedRecipe retire la photo au mieux, sans échouer si le bucket refuse', async () => {
    const remove = vi.fn().mockRejectedValue(new Error('refusé'))
    const client = {
      from: vi.fn((table: string) => {
        if (table !== 'recipes') throw new Error('table inattendue')
        return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { photo_path: `${ID}/a.jpg` } }) })) })),
          delete: vi.fn(() => ({ eq: vi.fn(() => ({ select: vi.fn().mockResolvedValue({ data: [{ id: ID }], error: null }) })) }))
        }
      }),
      storage: { from: vi.fn(() => ({ remove })) }
    } as unknown as SupabaseClient<Database>
    await expect(deleteReportedRecipe(client, ID)).resolves.toBeUndefined()
    expect(remove).toHaveBeenCalledWith([`${ID}/a.jpg`])
  })
})
