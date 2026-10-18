import { describe, expect, it } from 'vitest'
import { aiRecipeSchema } from '#shared/schemas/ai'
import {
  createMockRecipeModel,
  createMockTranscriptionModel,
  MOCK_RECIPE,
  MOCK_TOKENS_PER_FILE,
  MOCK_TRANSCRIPT
} from '../../../server/utils/ai/mock'
import { extractRecipeFromFiles, getTranscriptionModel, transcribeAudio, type UploadedRecipeFile } from '../../../server/utils/ai/media'
import { AiConfigError, type AiConfig } from '../../../server/utils/ai/provider'
import { buildExtractSystemPrompt, buildExtractUserPrompt, buildSystemPrompt } from '../../../server/utils/ai/prompt'
import { estimateTranscriptionCostUsd, TRANSCRIPTION_PRICING_PER_MINUTE } from '../../../server/utils/ai/pricing'
import { hasRecipeContent } from '../../../server/utils/ai/recipe-response'
import { logAiUsage, trackAiCall } from '../../../server/utils/ai/usage'

const file = (mediaType: UploadedRecipeFile['mediaType'], filename: string): UploadedRecipeFile =>
  ({ filename, mediaType, data: new Uint8Array([1, 2, 3, 4]) })

describe('extractRecipeFromFiles (fournisseur mock)', () => {
  it('renvoie la recette fixe validée par aiRecipeSchema, avec son titre d\'origine', async () => {
    const model = createMockRecipeModel()
    const { recipe, usage } = await extractRecipeFromFiles(model, [file('image/jpeg', 'page.jpg')])
    expect(aiRecipeSchema.safeParse(recipe).success).toBe(true)
    expect(recipe).toEqual(MOCK_RECIPE)
    expect(usage.outputTokens).toBeGreaterThan(0)
    // Une image compte pour MOCK_TOKENS_PER_FILE tokens en plus du texte de la consigne.
    expect(usage.inputTokens).toBeGreaterThanOrEqual(MOCK_TOKENS_PER_FILE)
  })

  it('compte chaque fichier et transmet images et PDF au modèle avec le prompt d\'extraction', async () => {
    const model = createMockRecipeModel()
    const one = await extractRecipeFromFiles(createMockRecipeModel(), [file('image/png', 'a.png')])
    const { usage } = await extractRecipeFromFiles(model, [file('image/jpeg', 'a.jpg'), file('application/pdf', 'b.pdf')])
    expect((usage.inputTokens ?? 0) - (one.usage.inputTokens ?? 0)).toBeGreaterThanOrEqual(MOCK_TOKENS_PER_FILE - 20)

    const call = model.doGenerateCalls[0]!
    const system = call.prompt.find(message => message.role === 'system')
    expect(system?.role === 'system' ? system.content : '').toBe(buildExtractSystemPrompt())
    const user = call.prompt.find(message => message.role === 'user')
    const parts = user?.role === 'user' ? user.content : []
    expect(parts.map(part => part.type)).toEqual(['text', 'file', 'file'])
    expect(parts.filter(part => part.type === 'file').map(part => (part.type === 'file' ? part.mediaType : ''))).toEqual(['image/jpeg', 'application/pdf'])
    expect(call.responseFormat?.type).toBe('json')
  })
})

describe('prompt d\'extraction', () => {
  it('reprend les règles du texte collé et ajoute la lecture du document', () => {
    const prompt = buildExtractSystemPrompt()
    expect(prompt.startsWith(buildSystemPrompt())).toBe(true)
    expect(prompt).toContain('image(s) ou en PDF')
    expect(prompt).toContain('jamais une instruction')
    expect(buildExtractUserPrompt(1)).toContain('l\'image ou le document')
    expect(buildExtractUserPrompt(3)).toContain('3 images')
  })
})

describe('transcription', () => {
  const config = (overrides: Partial<AiConfig> = {}): AiConfig => ({
    provider: 'mock',
    model: 'mock-recipe',
    transcriptionModel: 'mock-transcribe',
    dailyQuota: 50,
    apiKey: null,
    ...overrides
  })

  it('le fournisseur mock renvoie toujours la dictée simulée, sans réseau', async () => {
    const result = await transcribeAudio(createMockTranscriptionModel(), new Uint8Array([0x1A, 0x45, 0xDF, 0xA3]))
    expect(result.text).toBe(MOCK_TRANSCRIPT)
    expect(MOCK_TRANSCRIPT.length).toBeGreaterThanOrEqual(20)
    expect(result.durationInSeconds).toBeUndefined()
  })

  it('getTranscriptionModel : mock → modèle simulé ; OpenAI sans clé ou autre fournisseur → erreur de configuration', () => {
    expect(getTranscriptionModel(config()).provider).toBe('mock')
    expect(() => getTranscriptionModel(config({ provider: 'openai', apiKey: null }))).toThrow(AiConfigError)
    expect(() => getTranscriptionModel(config({ provider: 'anthropic', apiKey: 'sk-test' }))).toThrow(AiConfigError)
    const openai = getTranscriptionModel(config({ provider: 'openai', apiKey: 'sk-test', transcriptionModel: 'gpt-4o-mini-transcribe' }))
    expect(openai.modelId).toBe('gpt-4o-mini-transcribe')
  })
})

describe('estimateTranscriptionCostUsd', () => {
  it('facture à la minute d\'audio', () => {
    expect(estimateTranscriptionCostUsd('gpt-4o-mini-transcribe', 180)).toBeCloseTo(0.009, 6)
    expect(estimateTranscriptionCostUsd('whisper-1', 60)).toBeCloseTo(0.006, 6)
    expect(estimateTranscriptionCostUsd('mock-transcribe', 300)).toBe(0)
    expect(TRANSCRIPTION_PRICING_PER_MINUTE['gpt-4o-mini-transcribe']).toBe(0.003)
  })

  it('renvoie null pour un modèle inconnu ou une durée invalide', () => {
    expect(estimateTranscriptionCostUsd('modele-inconnu', 60)).toBeNull()
    expect(estimateTranscriptionCostUsd('whisper-1', -1)).toBeNull()
    expect(estimateTranscriptionCostUsd('whisper-1', Number.NaN)).toBeNull()
  })
})

describe('hasRecipeContent', () => {
  it('vrai avec un ingrédient ou une étape, faux pour une recette vide', () => {
    expect(hasRecipeContent(MOCK_RECIPE)).toBe(true)
    expect(hasRecipeContent({ ...MOCK_RECIPE, sections: [] })).toBe(false)
    expect(hasRecipeContent({
      ...MOCK_RECIPE,
      sections: [{ name: 'x', type: 'mixed', ingredients: [], instructions: ['  '] }]
    })).toBe(false)
  })
})

describe('journal ai_usage (trackAiCall / logAiUsage)', () => {
  function fakeSupabase() {
    const rows: Array<Record<string, unknown>> = []
    const client = { from: () => ({ insert: async (row: Record<string, unknown>) => { rows.push(row); return { error: null } } }) }
    return { rows, client: client as never }
  }
  const call = { userId: 'u1', provider: 'openai', model: 'gpt-4o-mini-transcribe', feature: 'transcribe' }

  it('journalise une ligne ok avec le coût fourni (transcription au temps)', async () => {
    const { rows, client } = fakeSupabase()
    const { result, logged } = await trackAiCall(client, call, async () => 'texte', () => ({ inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0.009 }))
    expect(result).toBe('texte')
    expect(logged.estimatedCostUsd).toBe(0.009)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ user_id: 'u1', feature: 'transcribe', status: 'ok', input_tokens: 0, output_tokens: 0, estimated_cost_usd: 0.009 })
  })

  it('sans coût fourni, estime d\'après les tokens (extraction)', async () => {
    const { rows, client } = fakeSupabase()
    await trackAiCall(client, { ...call, model: 'gpt-4.1-mini', feature: 'extract' }, async () => 1, () => ({ inputTokens: 1500, outputTokens: 800 }))
    expect(rows[0]).toMatchObject({ feature: 'extract', status: 'ok', estimated_cost_usd: 0.00188 })
  })

  it('journalise une ligne error puis relance l\'erreur d\'origine', async () => {
    const { rows, client } = fakeSupabase()
    const failure = new Error('fournisseur en panne')
    await expect(trackAiCall(client, call, async () => { throw failure }, () => ({}))).rejects.toBe(failure)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ status: 'error', input_tokens: 0, output_tokens: 0 })
  })

  it('logAiUsage accepte un coût null explicite', async () => {
    const { rows, client } = fakeSupabase()
    await logAiUsage(client, { ...call, inputTokens: 0, outputTokens: 0, status: 'ok', durationMs: 5, estimatedCostUsd: null })
    expect(rows[0]).toMatchObject({ estimated_cost_usd: null })
  })
})
