import { describe, expect, it, vi } from 'vitest'
import { APICallError } from 'ai'
import type { SupabaseClient } from '@supabase/supabase-js'
import { aiHttpError, fetchAiStatus, parseReserveOutcome, reserveAiCall } from '../../../server/utils/ai/availability'
import { AI_CODES, decideAiStatus, formatResetsAt, parseQuotaInfo, parseServiceInfo, type AiLimits } from '../../../shared/utils/aiStatus'

const LIMITS: AiLimits = { dailyQuota: 50, newAccountQuota: 20, newAccountDays: 30, monthlyBudgetCalls: 0, monthlyBudgetUsd: 0 }
const RESETS = '2026-10-24T22:00:00+00:00'

const quotaRow = (used: number, quota: number, isNew = true) => ({ used, quota, resets_at: RESETS, is_new: isNew, has_override: false })
const serviceRow = (overrides: Record<string, unknown> = {}) => ({ credit_exhausted: false, since: null, budget_exceeded: false, ...overrides })

/** Faux client : seules les deux RPC de la phase 7 existent. */
function fakeClient(service: { data?: unknown, error?: unknown }, quota: { data?: unknown, error?: unknown }) {
  const rpc = vi.fn(async (name: string) => (name === 'ai_service_status' ? { data: service.data ?? null, error: service.error ?? null } : { data: quota.data ?? null, error: quota.error ?? null }))
  return { client: { rpc } as unknown as SupabaseClient, rpc }
}

async function thrown(promise: Promise<unknown>): Promise<Record<string, unknown>> {
  try {
    await promise
  } catch (error) {
    return error as Record<string, unknown>
  }
  throw new Error('aucune erreur levée')
}

describe('état de l\'IA (décision pure)', () => {
  it('tout va bien : disponible, avec le nombre d\'appels restants', () => {
    const status = decideAiStatus(parseServiceInfo(serviceRow()), parseQuotaInfo(quotaRow(3, 20)))
    expect(status).toMatchObject({ available: true, reason: null })
    expect(status.quota).toMatchObject({ used: 3, quota: 20, remaining: 17, resetsAt: RESETS, isNew: true })
  })

  it('« quota du jour atteint » et « crédit épuisé » sont distincts', () => {
    expect(decideAiStatus(parseServiceInfo(serviceRow()), parseQuotaInfo(quotaRow(20, 20))).reason).toBe('quota')
    expect(decideAiStatus(parseServiceInfo(serviceRow({ credit_exhausted: true, since: '2026-10-24T08:00:00Z' })), parseQuotaInfo(quotaRow(0, 20)))).toMatchObject({ available: false, reason: 'credit', since: '2026-10-24T08:00:00Z' })
    expect(decideAiStatus(parseServiceInfo(serviceRow({ budget_exceeded: true })), parseQuotaInfo(quotaRow(0, 20))).reason).toBe('budget')
  })

  it('le service coupé prime sur le plafond personnel', () => {
    expect(decideAiStatus(parseServiceInfo(serviceRow({ credit_exhausted: true })), parseQuotaInfo(quotaRow(99, 20))).reason).toBe('credit')
  })

  it('un plafond de 0 coupe l\'IA pour ce compte', () => {
    expect(decideAiStatus(null, parseQuotaInfo(quotaRow(0, 0))).reason).toBe('quota')
  })

  it('données absentes ou illisibles : jamais de blocage', () => {
    expect(decideAiStatus(null, null)).toEqual({ available: true, reason: null, quota: null, since: null })
    expect(parseQuotaInfo({ used: 'x' })).toBeNull()
    expect(parseServiceInfo('oups')).toBeNull()
  })

  it('formate la remise à zéro en heure de Paris', () => {
    // 22:00 UTC le 24 octobre = minuit à Paris (heure d'été jusqu'au 25 octobre 03:00 : 00:00 le 25)
    expect(formatResetsAt(RESETS, 'fr')).toMatch(/25 octobre.*00:00/)
    expect(formatResetsAt('pas une date', 'fr')).toBe('')
  })
})

/** Faux client service_role : `reserve_ai_call` répond ce qu'on lui dit, `finish_ai_call` est enregistrée. */
function fakeAdmin(reserve: { data?: unknown, error?: unknown }) {
  const rpc = vi.fn(async (name: string) => (name === 'reserve_ai_call' ? { data: reserve.data ?? null, error: reserve.error ?? null } : { data: true, error: null }))
  return { client: { rpc } as unknown as SupabaseClient, rpc }
}
const INPUT = { userId: 'user-1', feature: 'translate' }

describe('statut affiché (sans seuil passé par l\'appelant)', () => {
  it('appelle ai_service_status SANS argument et ai_quota_status avec les plafonds du serveur', async () => {
    const { client, rpc } = fakeClient({ data: serviceRow() }, { data: quotaRow(1, 20) })
    const status = await fetchAiStatus(client, { ...LIMITS, monthlyBudgetCalls: 500, monthlyBudgetUsd: 5 })
    expect(status.available).toBe(true)
    expect(rpc).toHaveBeenCalledWith('ai_service_status')   // le budget n'est pas transmis : sinon on pourrait déduire les totaux du mois
    expect(rpc).toHaveBeenCalledWith('ai_quota_status', { p_default_quota: 50, p_new_quota: 20, p_new_days: 30 })
  })

  it('RPC indisponible (migration non appliquée) : on laisse passer, en journalisant', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { client } = fakeClient({ error: { message: 'absente' } }, { error: { message: 'absente' } })
    await expect(fetchAiStatus(client, LIMITS)).resolves.toMatchObject({ available: true, quota: null })
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('réservation d\'un appel IA (v2)', () => {
  it('passe quand tout va bien : identité et seuils donnés par le serveur, réservation terminable', async () => {
    const { client, rpc } = fakeAdmin({ data: { ok: true, id: 'res-1', used: 1, quota: 20, resets_at: RESETS, is_new: true } })
    const reservation = await reserveAiCall(client, INPUT, { ...LIMITS, monthlyBudgetCalls: 500, monthlyBudgetUsd: 5 })
    expect(rpc).toHaveBeenCalledWith('reserve_ai_call', {
      p_user: 'user-1', p_feature: 'translate', p_default_quota: 50, p_new_quota: 20, p_new_days: 30, p_budget_calls: 500, p_budget_usd: 5
    })
    expect(reservation?.id).toBe('res-1')
    await expect(reservation!.finish({
      userId: 'user-1', provider: 'mock', model: 'm', feature: 'translate', inputTokens: 10, outputTokens: 5, status: 'ok', durationMs: 120, estimatedCostUsd: 0.01
    })).resolves.toBe(true)
    expect(rpc).toHaveBeenCalledWith('finish_ai_call', {
      p_id: 'res-1', p_provider: 'mock', p_model: 'm', p_input_tokens: 10, p_output_tokens: 5, p_estimated_cost_usd: 0.01, p_status: 'ok', p_duration_ms: 120
    })
  })

  it('crédit épuisé : 503 AI_UNAVAILABLE, message clair pour tous', async () => {
    const { client } = fakeAdmin({ data: { ok: false, reason: 'credit', since: '2026-10-24T08:00:00Z' } })
    const error = await thrown(reserveAiCall(client, INPUT, LIMITS))
    expect(error.statusCode).toBe(503)
    expect(error.statusMessage).toMatch(/momentanément indisponibles.*saisir la recette à la main/)
    expect(error.data).toMatchObject({ code: AI_CODES.unavailable, reason: 'credit' })
  })

  it('budget du mois atteint : même message que le crédit, et prévient Nina une fois', async () => {
    const { client } = fakeAdmin({ data: { ok: false, reason: 'budget' } })
    const onBudgetExceeded = vi.fn(async () => undefined)
    const error = await thrown(reserveAiCall(client, INPUT, LIMITS, { onBudgetExceeded }))
    expect(error.statusCode).toBe(503)
    expect(error.statusMessage).toMatch(/momentanément indisponibles/)
    expect(error.data).toMatchObject({ code: AI_CODES.unavailable, reason: 'budget' })
    expect(onBudgetExceeded).toHaveBeenCalledTimes(1)
  })

  it('une alerte de budget qui échoue ne change pas la réponse', async () => {
    const { client } = fakeAdmin({ data: { ok: false, reason: 'budget' } })
    const error = await thrown(reserveAiCall(client, INPUT, LIMITS, { onBudgetExceeded: async () => { throw new Error('Resend en panne') } }))
    expect(error.statusCode).toBe(503)
  })

  it('plafond du jour atteint : 429 AI_QUOTA_REACHED avec l\'heure de remise à zéro', async () => {
    const { client } = fakeAdmin({ data: { ok: false, reason: 'quota', used: 20, quota: 20, resets_at: RESETS, is_new: true } })
    const error = await thrown(reserveAiCall(client, INPUT, LIMITS))
    expect(error.statusCode).toBe(429)
    expect(error.statusMessage).toMatch(/Quota du jour atteint \(20 appels/)
    expect(error.data).toEqual({ code: AI_CODES.quotaReached, quota: 20, resetsAt: RESETS })
  })

  it('RPC indisponible (migration non appliquée) ou réponse inattendue : on laisse passer, sans réservation, en journalisant', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(reserveAiCall(fakeAdmin({ error: { message: 'absente' } }).client, INPUT, LIMITS)).resolves.toBeNull()
    await expect(reserveAiCall(fakeAdmin({ data: 'oups' }).client, INPUT, LIMITS)).resolves.toBeNull()
    expect(spy).toHaveBeenCalledTimes(2)
    spy.mockRestore()
  })

  it('parseReserveOutcome refuse les formes inconnues', () => {
    expect(parseReserveOutcome({ ok: true })).toBeNull()
    expect(parseReserveOutcome({ ok: false, reason: 'autre' })).toBeNull()
    expect(parseReserveOutcome(null)).toBeNull()
    expect(parseReserveOutcome({ ok: true, id: 'x' })).toEqual({ ok: true, id: 'x' })
  })
})

describe('erreur du fournisseur vers erreur HTTP v2', () => {
  const apiError = (statusCode: number, body: unknown) => new APICallError({ message: 'x', url: 'u', requestBodyValues: {}, statusCode, data: body, isRetryable: false })

  it('crédit : 503 AI_UNAVAILABLE ; débit : 503 AI_BUSY ; le reste : rien', () => {
    const credit = aiHttpError(apiError(429, { error: { code: 'insufficient_quota', message: 'quota' } }))
    expect(credit).toMatchObject({ statusCode: 503, data: { code: AI_CODES.unavailable } })
    const busy = aiHttpError(apiError(429, { error: { code: 'rate_limit_exceeded', message: 'Rate limit reached' } }))
    expect(busy).toMatchObject({ statusCode: 503, data: { code: AI_CODES.busy } })
    expect(aiHttpError(apiError(401, {}))).toBeUndefined()
    expect(aiHttpError(new Error('boom'))).toBeUndefined()
  })
})
