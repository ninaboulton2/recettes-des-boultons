import { APICallError } from 'ai'
import { MockLanguageModelV4, MockTranscriptionModelV4 } from 'ai/test'
import type { LanguageModelV4CallOptions } from '@ai-sdk/provider'
import type { AiRecipe } from '#shared/schemas/ai'
import type { AiTranslateExisting, AiTranslation } from '#shared/schemas/translation'
import { detectLanguage, flattenTexts, otherLang, type RecipeTexts } from '#shared/utils/translation'
import type { RecipeLang } from '#shared/types'

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
 * Recettes bilingues (0016) : la « traduction » simulée préfixe chaque texte de
 * « [EN] » (source française) ou « [FR] » (source anglaise), ce qui la rend
 * déterministe et reconnaissable dans les tests. La langue source est devinée
 * par `detectLanguage` (heuristique de mots courants). La traduction d'une
 * recette existante (`schemaName` « traduction ») préfixe les textes reçus ; les
 * quantités purement numériques ne sont jamais envoyées donc jamais préfixées.
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

/** Préfixe de la traduction simulée vers `target`. */
export const mockPrefix = (target: RecipeLang): string => (target === 'en' ? '[EN] ' : '[FR] ')

const prefixed = (prefix: string, value: string): string => (value.trim() === '' ? value : `${prefix}${value}`)
const prefixedOrNull = (prefix: string, value: string | null): string | null => (value === null ? null : prefixed(prefix, value))

/** Traduction simulée de textes de recette (structure identique, chaque texte préfixé). */
export function mockTranslateTexts(texts: RecipeTexts, target: RecipeLang): AiTranslation {
  const prefix = mockPrefix(target)
  return {
    title: prefixed(prefix, texts.title),
    description: prefixedOrNull(prefix, texts.description),
    notes: prefixedOrNull(prefix, texts.notes),
    tags: texts.tags.map(tag => prefixed(prefix, tag)),
    sections: texts.sections.map(section => ({
      name: prefixed(prefix, section.name),
      ingredients: section.ingredients.map(ingredient => ({
        name: prefixed(prefix, ingredient.name),
        amount: prefixedOrNull(prefix, ingredient.amount),
        unit: prefixedOrNull(prefix, ingredient.unit)
      })),
      instructions: section.instructions.map(step => prefixed(prefix, step))
    }))
  }
}

/** Textes d'une recette de l'IA (mêmes positions que sa traduction). */
function aiRecipeTexts(recipe: MockRecipeBase): RecipeTexts {
  return {
    title: recipe.title,
    description: recipe.description,
    notes: recipe.notes,
    tags: recipe.tags,
    sections: recipe.sections.map(section => ({
      name: section.name,
      ingredients: section.ingredients.map(ingredient => ({
        name: ingredient.name,
        // Les quantités de l'IA sont des nombres : rien à traduire.
        amount: null,
        unit: ingredient.unit ? null : ingredient.unitText
      })),
      instructions: section.instructions
    }))
  }
}

type MockRecipeBase = Omit<AiRecipe, 'sourceLanguage' | 'translation'>

export const MOCK_RECIPE_BASE: MockRecipeBase = {
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

/** Recette fixe, rédigée dans `sourceLanguage` (le mock ne traduit pas la base : il préfixe la traduction). */
export function mockRecipe(title: string, sourceLanguage: RecipeLang): AiRecipe {
  const base: MockRecipeBase = { ...MOCK_RECIPE_BASE, title }
  return { ...base, sourceLanguage, translation: mockTranslateTexts(aiRecipeTexts(base), otherLang(sourceLanguage)) }
}

/** Recette fixe d'origine (français), avec sa traduction simulée vers l'anglais. */
export const MOCK_RECIPE: AiRecipe = mockRecipe('Cookies aux pépites de chocolat', 'fr')

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

/** Texte du dernier message utilisateur, hors balise fermante. */
function recipeBodyOfPrompt(options: LanguageModelV4CallOptions): string | null {
  const lastUser = [...options.prompt].reverse().find(message => message.role === 'user')
  if (!lastUser || lastUser.role !== 'user') return null
  const text = lastUser.content
    .map(part => (part.type === 'text' ? part.text : ''))
    .join('\n')
  // La balise ouvrante est aussi citée dans la consigne : on prend la dernière.
  const marker = text.lastIndexOf('<recette>\n')
  const body = marker >= 0 ? text.slice(marker + '<recette>\n'.length) : text
  const end = body.lastIndexOf('\n</recette>')
  return end >= 0 ? body.slice(0, end) : body
}

/** Première ligne non vide du dernier message utilisateur (titre de la recette simulée). */
function firstLineOfPrompt(options: LanguageModelV4CallOptions): string | null {
  const body = recipeBodyOfPrompt(options)
  const line = body?.split('\n').map(s => s.trim()).find(s => s !== '' && s !== '</recette>')
  return line ? line.slice(0, 200) : null
}

/** Nom du schéma demandé à `generateObject` (« recette » ou « traduction »). */
function schemaNameOf(options: LanguageModelV4CallOptions): string | undefined {
  const format = options.responseFormat
  return format && format.type === 'json' ? format.name : undefined
}

/**
 * Marqueur de panne simulée : une recette dont les textes le contiennent fait
 * échouer la traduction (503 du « fournisseur »), pour tester l'échec sans IA
 * (enregistrement réussi, traduction périmée, reprise par la page Traductions).
 */
export const MOCK_FAILURE_MARKER = '__MOCK_AI_FAILURE__'

/** Réponse simulée à une demande de traduction d'une recette existante. */
function mockTranslateExisting(options: LanguageModelV4CallOptions): AiTranslateExisting {
  const body = recipeBodyOfPrompt(options) ?? '{}'
  if (body.includes(MOCK_FAILURE_MARKER)) {
    throw new APICallError({ message: 'panne simulée', url: 'mock://ai', requestBodyValues: {}, statusCode: 503, isRetryable: false })
  }
  const texts = JSON.parse(body) as RecipeTexts
  const sourceLanguage = detectLanguage(flattenTexts(texts))
  return { sourceLanguage, translation: mockTranslateTexts(texts, otherLang(sourceLanguage)) }
}

export function createMockRecipeModel(): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    provider: 'mock',
    modelId: MOCK_MODEL_ID,
    doGenerate: async (options) => {
      const files = countFileParts(options)
      let text: string
      if (schemaNameOf(options) === 'traduction') {
        text = JSON.stringify(mockTranslateExisting(options))
      } else {
        // Avec une photo ou un PDF, la consigne texte n'est pas une recette : titre d'origine, français.
        const title = (files > 0 ? null : firstLineOfPrompt(options)) ?? MOCK_RECIPE.title
        const sourceLanguage = files > 0 ? 'fr' : detectLanguage(recipeBodyOfPrompt(options) ?? '')
        text = JSON.stringify(mockRecipe(title, sourceLanguage))
      }
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
