import { describe, expect, it, vi } from 'vitest'
import { APICallError } from 'ai'
import { reportBillingFailure } from '../../../server/utils/ai/creditAlert'
import { probeAiCredit } from '../../../server/utils/ai/probe'

const apiError = (statusCode: number, body: unknown) => new APICallError({ message: 'x', url: 'u', requestBodyValues: {}, statusCode, data: body, isRetryable: false })
const billing = () => apiError(429, { error: { code: 'insufficient_quota', message: 'quota' } })
const rateLimit = () => apiError(429, { error: { code: 'rate_limit_exceeded', message: 'Rate limit reached' } })

/** Imite `report_ai_billing_error` : vrai la première fois, puis faux tant que 24 h ne se sont pas écoulées. */
function throttledReport(now: () => number) {
  let notifiedAt: number | null = null
  return vi.fn(async () => {
    if (notifiedAt === null || now() - notifiedAt >= 24 * 3600 * 1000) {
      notifiedAt = now()
      return true
    }
    return false
  })
}

describe('alerte de crédit : un e-mail au plus par 24 h', () => {
  it('plusieurs pannes de suite = un seul e-mail ; après 24 h, un nouveau', async () => {
    let clock = Date.UTC(2026, 9, 24, 8, 0, 0)
    const report = throttledReport(() => clock)
    const sendAlert = vi.fn(async () => undefined)
    const ports = { report, sendAlert }

    expect(await reportBillingFailure(ports, billing())).toBe('recorded_and_notified')
    expect(await reportBillingFailure(ports, billing())).toBe('recorded')
    expect(await reportBillingFailure(ports, billing())).toBe('recorded')
    expect(sendAlert).toHaveBeenCalledTimes(1)
    expect(report).toHaveBeenCalledTimes(3)

    clock += 23 * 3600 * 1000
    expect(await reportBillingFailure(ports, billing())).toBe('recorded')
    clock += 2 * 3600 * 1000
    expect(await reportBillingFailure(ports, billing())).toBe('recorded_and_notified')
    expect(sendAlert).toHaveBeenCalledTimes(2)
  })

  it('un simple débit ou une autre erreur n\'enregistre rien', async () => {
    const ports = { report: vi.fn(async () => true), sendAlert: vi.fn(async () => undefined) }
    expect(await reportBillingFailure(ports, rateLimit())).toBe('ignored')
    expect(await reportBillingFailure(ports, new Error('boom'))).toBe('ignored')
    expect(ports.report).not.toHaveBeenCalled()
    expect(ports.sendAlert).not.toHaveBeenCalled()
  })

  it('ne lève jamais : base ou e-mail en panne', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(await reportBillingFailure({ report: async () => { throw new Error('pas de clé service_role') }, sendAlert: async () => undefined }, billing())).toBe('failed')
    expect(await reportBillingFailure({ report: async () => true, sendAlert: async () => { throw new Error('Resend') } }, billing())).toBe('failed')
    spy.mockRestore()
  })
})

describe('rattrapage du crédit (appel d\'essai quotidien)', () => {
  const ports = (overrides: Partial<Parameters<typeof probeAiCredit>[0]> = {}) => ({
    isAlertActive: vi.fn(async () => true),
    callProvider: vi.fn(async () => undefined),
    resetAlert: vi.fn(async () => true),
    recordBillingFailure: vi.fn(async () => undefined),
    ...overrides
  })

  it('sans alerte active : aucun appel au fournisseur (aucun coût)', async () => {
    const p = ports({ isAlertActive: async () => false })
    expect(await probeAiCredit(p)).toEqual({ status: 'idle' })
    expect(p.callProvider).not.toHaveBeenCalled()
  })

  it('le fournisseur répond de nouveau : l\'alerte est levée', async () => {
    const p = ports()
    expect(await probeAiCredit(p)).toEqual({ status: 'reset', changed: true })
    expect(p.resetAlert).toHaveBeenCalledTimes(1)
  })

  it('toujours sans crédit : l\'alerte reste', async () => {
    const p = ports({ callProvider: async () => { throw billing() } })
    expect(await probeAiCredit(p)).toEqual({ status: 'still_exhausted' })
    expect(p.resetAlert).not.toHaveBeenCalled()
    expect(p.recordBillingFailure).toHaveBeenCalledTimes(1)
  })

  it('autre erreur (débit, réseau) : l\'alerte reste, sans la renouveler', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const p = ports({ callProvider: async () => { throw rateLimit() } })
    expect(await probeAiCredit(p)).toEqual({ status: 'error', kind: 'rate_limit' })
    expect(p.resetAlert).not.toHaveBeenCalled()
    expect(p.recordBillingFailure).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
