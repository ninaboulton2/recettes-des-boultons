import { MockLanguageModelV4, MockTranscriptionModelV4 } from 'ai/test'
import type { LanguageModelV4CallOptions } from '@ai-sdk/provider'
import type { AiRecipe } from '#shared/schemas/ai'

/**
 * Fournisseur simulé (`AI_PROVIDER=mock`) : aucun appel réseau, aucun coût.
 *
 * Renvoie toujours la même recette structurée (en français), avec deux
 * concessions pour les tests de bout en bout :
 *  - le titre reprend la première ligne non vide du texte collé (pour nommer
 *    les recettes de test `TEST_…` et les retrouver/supprimer) ;
 *  - un comptage de tokens approximatif (4 caractères ≈ 1 token) pour
 *    exercer la journalisation `ai_usage` et l'estimation de coût.
 *
 * Entrées média (phase 5) :
 *  - photo / PDF (`generateObject` avec des parties `image` ou `file`) : la
 *    recette fixe, avec son titre d'origine ; chaque fichier compte pour
 *    `MOCK_TOKENS_PER_FILE` tokens en entrée ;
 *  - dictée (`createMockTranscriptionModel`) : toujours `MOCK_TRANSCRIPT`
 *    (une recette dictée en français), quel que soit l'audio reçu.
 */

export const MOCK_MODEL_ID = 'mock-recipe'
export const MOCK_TRANSCRIPTION_MODEL_ID = 'mock-transcribe'

/** Tokens d'entrée comptés par image ou PDF dans le fournisseur simulé. */
export const MOCK_TOKENS_PER_FILE = 800

/** Texte renvoyé par la transcription simulée (≥ 20 caractères : directement structurable). */
export const MOCK_TRANSCRIPT = 'Cookies aux pépites de chocolat. Il faut deux cent quatre-vingts grammes de farine, '
  + 'deux cent vingt-cinq grammes de beurre doux ramolli, cent cinquante grammes de sucre roux, deux œufs, '
  + 'une cuillère à café d\'extrait de vanille et trois cents grammes de pépites de chocolat. '
  + 'Préchauffer le four à cent quatre-vingts degrés, fouetter le beurre avec le sucre, ajouter les œufs, '
  + 'puis la farine et les pépites. Former des boules de pâte et enfourner dix à douze minutes.'

export const MOCK_RECIPE: AiRecipe = {
  title: 'Cookies aux pépites de chocolat',
  description: 'Des cookies moelleux au centre et croustillants sur les bords.',
  category: 'desserts et gâteaux',
  prepTime: 15,
  cookTime: 12,
  servings: 24,
  tags: ['végétarien'],
  notes: 'Laisser reposer la pâte une nuit au frais pour plus de goût.',
  sections: [
    {
      name: 'Pâte',
      type: 'ingredients',
      ingredients: [
        { name: 'farine', amount: 280, unit: 'g', unitText: null, optional: false },
        { name: 'beurre doux, ramolli', amount: 225, unit: 'g', unitText: null, optional: false },
        { name: 'sucre roux', amount: 150, unit: 'g', unitText: null, optional: false },
        { name: 'œufs', amount: 2, unit: null, unitText: null, optional: false },
        { name: 'extrait de vanille', amount: 1, unit: 'cac', unitText: null, optional: false },
        { name: 'bicarbonate de soude', amount: 1, unit: 'cac', unitText: null, optional: false },
        { name: 'sel', amount: 1, unit: 'pincee', unitText: null, optional: false },
        { name: 'pépites de chocolat', amount: 300, unit: 'g', unitText: null, optional: false },
        { name: 'noix de pécan', amount: 1, unit: null, unitText: 'stick', optional: true }
      ],
      instructions: []
    },
    {
      name: 'Préparation',
      type: 'instructions',
      ingredients: [],
      instructions: [
        'Préchauffer le four à 180 °C.',
        'Fouetter le beurre avec le sucre jusqu\'à obtenir une crème.',
        'Ajouter les œufs un à un puis la vanille.',
        'Incorporer la farine, le bicarbonate et le sel, puis les pépites.',
        'Former des boules de pâte et enfourner 10 à 12 minutes.'
      ]
    }
  ]
}

/** Nombre d'images / PDF joints au dernier message utilisateur. */
function countFileParts(options: LanguageModelV4CallOptions): number {
  const lastUser = [...options.prompt].reverse().find(message => message.role === 'user')
  if (!lastUser || lastUser.role !== 'user') return 0
  return lastUser.content.filter(part => part.type === 'file').length
}

/** Longueur du texte du prompt, hors octets des fichiers (qui ne sont pas du texte). */
function textLengthOfPrompt(options: LanguageModelV4CallOptions): number {
  return options.prompt.reduce((total, message) => {
    if (typeof message.content === 'string') return total + message.content.length
    return total + message.content.reduce((sum, part) => sum + (part.type === 'text' ? part.text.length : 0), 0)
  }, 0)
}

/** Première ligne non vide du dernier message utilisateur (titre de la recette simulée). */
function firstLineOfPrompt(options: LanguageModelV4CallOptions): string | null {
  const lastUser = [...options.prompt].reverse().find(message => message.role === 'user')
  if (!lastUser || lastUser.role !== 'user') return null
  const text = lastUser.content
    .map(part => (part.type === 'text' ? part.text : ''))
    .join('\n')
  // La balise ouvrante est aussi citée dans la consigne : on prend la dernière.
  const marker = text.lastIndexOf('<recette>\n')
  const body = marker >= 0 ? text.slice(marker + '<recette>\n'.length) : text
  const line = body.split('\n').map(s => s.trim()).find(s => s !== '' && s !== '</recette>')
  return line ? line.slice(0, 200) : null
}

export function createMockRecipeModel(): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    provider: 'mock',
    modelId: MOCK_MODEL_ID,
    doGenerate: async (options) => {
      const files = countFileParts(options)
      // Avec une photo ou un PDF, la consigne texte n'est pas une recette : titre d'origine.
      const title = (files > 0 ? null : firstLineOfPrompt(options)) ?? MOCK_RECIPE.title
      const recipe: AiRecipe = { ...MOCK_RECIPE, title }
      const text = JSON.stringify(recipe)
      const promptTokens = Math.ceil(textLengthOfPrompt(options) / 4) + files * MOCK_TOKENS_PER_FILE
      return {
        content: [{ type: 'text', text }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: {
          inputTokens: { total: promptTokens, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: Math.ceil(text.length / 4), text: undefined, reasoning: undefined }
        },
        warnings: []
      }
    }
  })
}

/** Transcription simulée : texte fixe, aucun appel réseau. */
export function createMockTranscriptionModel(): MockTranscriptionModelV4 {
  return new MockTranscriptionModelV4({
    provider: 'mock',
    modelId: MOCK_TRANSCRIPTION_MODEL_ID,
    doGenerate: async () => ({
      text: MOCK_TRANSCRIPT,
      segments: [],
      language: 'fr',
      durationInSeconds: undefined,
      warnings: [],
      response: { timestamp: new Date(), modelId: MOCK_TRANSCRIPTION_MODEL_ID }
    })
  })
}
