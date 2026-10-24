import { describe, expect, it } from 'vitest'
import { APICallError } from 'ai'
import { classifyAiError } from '../../../server/utils/ai/billing'

function apiError(statusCode: number | undefined, body?: unknown, message = 'erreur du fournisseur'): APICallError {
  return new APICallError({
    message,
    url: 'https://api.openai.com/v1/chat/completions',
    requestBodyValues: {},
    statusCode,
    responseBody: body === undefined ? undefined : JSON.stringify(body),
    data: body,
    isRetryable: statusCode === 429
  })
}

describe('classification des erreurs du fournisseur IA (crédit ou simple débit)', () => {
  it('OpenAI insufficient_quota (429) = crédit épuisé', () => {
    const body = { error: { message: 'You exceeded your current quota, please check your plan and billing details.', type: 'insufficient_quota', code: 'insufficient_quota' } }
    expect(classifyAiError(apiError(429, body))).toBe('billing')
  })

  it('limite de facturation atteinte ou compte de facturation inactif = crédit', () => {
    expect(classifyAiError(apiError(400, { error: { code: 'billing_hard_limit_reached', message: 'Billing hard limit has been reached' } }))).toBe('billing')
    expect(classifyAiError(apiError(429, { error: { code: 'billing_not_active', message: 'Your account is not active, please check your billing details' } }))).toBe('billing')
  })

  it('402 = crédit, quel que soit le corps', () => {
    expect(classifyAiError(apiError(402))).toBe('billing')
  })

  it('un 429 de simple débit n\'est PAS un crédit épuisé', () => {
    const body = { error: { message: 'Rate limit reached for gpt-4.1-mini on tokens per min (TPM): Limit 200000. Please try again in 6s.', type: 'tokens', code: 'rate_limit_exceeded' } }
    expect(classifyAiError(apiError(429, body))).toBe('rate_limit')
    expect(classifyAiError(apiError(429))).toBe('rate_limit')
  })

  it('un débit dont le message cite la facturation reste un débit quand le code le dit', () => {
    const body = { error: { message: 'Rate limit reached. Please check your plan and billing details.', type: 'requests', code: 'rate_limit_exceeded' } }
    expect(classifyAiError(apiError(429, body))).toBe('rate_limit')
  })

  it('lit aussi le corps JSON brut quand `data` est absent', () => {
    const error = new APICallError({
      message: 'x', url: 'u', requestBodyValues: {}, statusCode: 429, isRetryable: false,
      responseBody: JSON.stringify({ error: { code: 'insufficient_quota', message: 'quota' } })
    })
    expect(classifyAiError(error)).toBe('billing')
  })

  it('reconnaît les messages d\'autres fournisseurs (Anthropic : solde trop bas)', () => {
    const body = { type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing.' } }
    expect(classifyAiError(apiError(400, body))).toBe('billing')
  })

  it('401 / 403 = clé refusée, 408 / 504 = délai, le reste = autre', () => {
    expect(classifyAiError(apiError(401, { error: { code: 'invalid_api_key', message: 'Incorrect API key' } }))).toBe('auth')
    expect(classifyAiError(apiError(403, { error: { message: 'Forbidden' } }))).toBe('auth')
    expect(classifyAiError(apiError(504))).toBe('timeout')
    expect(classifyAiError(apiError(408))).toBe('timeout')
    expect(classifyAiError(apiError(500))).toBe('other')
    expect(classifyAiError(apiError(undefined))).toBe('other')
  })

  it('ce qui n\'est pas une erreur du fournisseur est « autre »', () => {
    expect(classifyAiError(new Error('insufficient_quota'))).toBe('other')
    expect(classifyAiError(null)).toBe('other')
    expect(classifyAiError('insufficient_quota')).toBe('other')
  })
})
