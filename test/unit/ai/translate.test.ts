import { describe, expect, it } from 'vitest'
import { APICallError, LoadAPIKeyError } from 'ai'
import { aiRecipeSchema } from '#shared/schemas/ai'
import { createMockRecipeModel, MOCK_RECIPE } from '../../../server/utils/ai/mock'
import { translateRecipeText } from '../../../server/utils/ai/translate'
import { AI_ERROR_MESSAGES, throwAiProviderError } from '../../../server/utils/ai/errors'
import { AiConfigError } from '../../../server/utils/ai/provider'
import { buildSystemPrompt } from '../../../server/utils/ai/prompt'

const SAMPLE = `TEST_3D_Chocolate chip cookies\n\n2 cups flour\n1 cup butter\nBake at 350°F for 12 minutes.`

describe('translateRecipeText (fournisseur mock)', () => {
  it('renvoie une recette validée par aiRecipeSchema, titrée d\'après la première ligne', async () => {
    const model = createMockRecipeModel()
    const { recipe, usage } = await translateRecipeText(model, SAMPLE, 'fr')
    expect(aiRecipeSchema.safeParse(recipe).success).toBe(true)
    expect(recipe.title).toBe('TEST_3D_Chocolate chip cookies')
    expect(recipe.sections).toEqual(MOCK_RECIPE.sections)
    expect(usage.inputTokens).toBeGreaterThan(0)
    expect(usage.outputTokens).toBeGreaterThan(0)
    expect(model.doGenerateCalls).toHaveLength(1)
  })

  it('transmet le prompt système en français avec la langue cible et les codes d\'unité', async () => {
    const model = createMockRecipeModel()
    await translateRecipeText(model, SAMPLE, 'en')
    const call = model.doGenerateCalls[0]!
    const system = call.prompt.find(message => message.role === 'system')
    expect(system?.role).toBe('system')
    if (system?.role !== 'system') return
    expect(system.content).toContain('anglais')
    expect(system.content).toContain('pincee')
    expect(system.content).toBe(buildSystemPrompt('en'))
    // Sortie structurée demandée au fournisseur (schéma JSON transmis).
    expect(call.responseFormat?.type).toBe('json')
  })
})

interface H3Like { statusCode: number, statusMessage?: string }

function mapped(error: unknown): H3Like {
  try {
    throwAiProviderError(error, 'test')
  } catch (thrown: unknown) {
    return thrown as H3Like
  }
  throw new Error('aucune erreur relancée')
}

const apiError = (statusCode: number) =>
  new APICallError({ message: `HTTP ${statusCode} detail technique`, url: 'https://api.example', requestBodyValues: {}, statusCode })

describe('throwAiProviderError', () => {
  it('clé absente ou refusée → 401 sans détail technique', () => {
    expect(mapped(new AiConfigError('Clé API absente'))).toMatchObject({ statusCode: 401, statusMessage: AI_ERROR_MESSAGES.apiKey })
    expect(mapped(new LoadAPIKeyError({ message: 'missing' }))).toMatchObject({ statusCode: 401 })
    expect(mapped(apiError(401))).toMatchObject({ statusCode: 401 })
    expect(mapped(apiError(403)).statusMessage).not.toContain('detail technique')
  })

  it('crédit fournisseur épuisé → 402, modèle/autre → 502, délai → 504', () => {
    expect(mapped(apiError(429))).toMatchObject({ statusCode: 402, statusMessage: AI_ERROR_MESSAGES.providerQuota })
    expect(mapped(apiError(402))).toMatchObject({ statusCode: 402 })
    expect(mapped(apiError(404))).toMatchObject({ statusCode: 502, statusMessage: AI_ERROR_MESSAGES.unavailable })
    expect(mapped(apiError(500))).toMatchObject({ statusCode: 502 })
    expect(mapped(apiError(504))).toMatchObject({ statusCode: 504, statusMessage: AI_ERROR_MESSAGES.timeout })
    const abort = new Error('aborted')
    abort.name = 'TimeoutError'
    expect(mapped(abort)).toMatchObject({ statusCode: 504 })
  })

  it('laisse passer les erreurs inconnues (gérées ensuite par handleApiError)', () => {
    expect(() => throwAiProviderError(new Error('autre'), 'test')).not.toThrow()
    expect(() => throwAiProviderError({ statusCode: 429 }, 'test')).not.toThrow()
  })
})
