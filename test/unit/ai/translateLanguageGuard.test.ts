import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LanguageModel } from 'ai'
import { TranslationShapeError } from '#shared/schemas/ai'
import type { RecipeTexts } from '#shared/utils/translation'
import { translateRecipeTexts } from '../../../server/utils/ai/translate'

// Le modèle « se trompe de langue » : la recette est française, il répond sourceLanguage = 'en' (cas réel : Blinis, Enchiladas…).
const generateObject = vi.hoisted(() => vi.fn())
vi.mock('ai', async (importOriginal) => ({ ...(await importOriginal<typeof import('ai')>()), generateObject }))

const frenchTexts: RecipeTexts = {
  title: 'Blinis',
  description: 'Petites crêpes légères et moelleuses.',
  notes: null,
  tags: [],
  sections: [{
    name: 'Recette',
    ingredients: [{ name: 'farine de blé', amount: null, unit: null }],
    instructions: [
      'Séparer les jaunes et les blancs des œufs.',
      'Verser la farine dans un saladier, puis ajouter le sel et le poivre.',
      'Faire cuire les cuillerées dans une poêle huilée avec du beurre.',
      'Laisser reposer la pâte avec le lait pendant une heure dans le four.'
    ]
  }]
}

const answer = (sourceLanguage: 'fr' | 'en') => ({
  object: {
    sourceLanguage,
    translation: {
      title: 'Blinis',
      description: 'Light and fluffy small pancakes.',
      notes: null,
      tags: [],
      sections: [{
        name: 'Recipe',
        ingredients: [{ name: 'wheat flour', amount: null, unit: null }],
        instructions: ['Separate the yolks.', 'Pour the flour.', 'Cook the spoonfuls.', 'Let rest.']
      }]
    }
  },
  usage: { inputTokens: 10, outputTokens: 10 }
})

describe('translateRecipeTexts : garde-fou de la langue source', () => {
  beforeEach(() => generateObject.mockReset())

  it('refuse une recette française déclarée anglaise : rien n\'est enregistré dans la mauvaise colonne', async () => {
    generateObject.mockResolvedValue(answer('en'))
    await expect(translateRecipeTexts({} as LanguageModel, frenchTexts)).rejects.toBeInstanceOf(TranslationShapeError)
  })

  it('accepte la langue source quand le texte la confirme', async () => {
    generateObject.mockResolvedValue(answer('fr'))
    const result = await translateRecipeTexts({} as LanguageModel, frenchTexts)
    expect(result.sourceLanguage).toBe('fr')
    expect(result.translation.title).toBe('Blinis')
  })
})
