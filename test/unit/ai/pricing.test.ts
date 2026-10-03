import { describe, expect, it } from 'vitest'
import { estimateCostUsd, getModelPricing, MODEL_PRICING, PRICING_DATE } from '../../../server/utils/ai/pricing'

describe('pricing', () => {
  it('estime le coût d\'une traduction type (1 500 entrée + 800 sortie)', () => {
    // gpt-4.1-mini : 0,40 $ / 1,60 $ par million → 0,0006 + 0,00128
    expect(estimateCostUsd('gpt-4.1-mini', 1500, 800)).toBeCloseTo(0.00188, 6)
    // mistral-small-latest : 0,15 $ / 0,60 $
    expect(estimateCostUsd('mistral-small-latest', 1500, 800)).toBeCloseTo(0.000705, 6)
    // claude-haiku-4-5 : 1 $ / 5 $
    expect(estimateCostUsd('claude-haiku-4-5', 1500, 800)).toBeCloseTo(0.0055, 6)
  })

  it('renvoie null pour un modèle inconnu ou sans comptage', () => {
    expect(estimateCostUsd('modele-inconnu', 1500, 800)).toBeNull()
    expect(estimateCostUsd('gpt-4.1-mini', undefined, 800)).toBeNull()
    expect(estimateCostUsd('gpt-4.1-mini', 1500, undefined)).toBeNull()
  })

  it('ignore un suffixe de version daté', () => {
    expect(getModelPricing('gpt-4.1-mini-2025-04-14')).toEqual(MODEL_PRICING['gpt-4.1-mini'])
    expect(getModelPricing('claude-haiku-4-5-20251001')).toEqual(MODEL_PRICING['claude-haiku-4-5'])
  })

  it('le fournisseur simulé est gratuit et la grille est datée', () => {
    expect(estimateCostUsd('mock-recipe', 10_000, 10_000)).toBe(0)
    expect(PRICING_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    for (const pricing of Object.values(MODEL_PRICING)) {
      expect(pricing.input).toBeGreaterThanOrEqual(0)
      expect(pricing.output).toBeGreaterThanOrEqual(pricing.input)
    }
  })
})
