import type { H3Event } from 'h3'
import type { LanguageModel } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createMistral } from '@ai-sdk/mistral'
import { createMockRecipeModel, MOCK_MODEL_ID } from './mock'

/**
 * Sélection du fournisseur / modèle IA depuis la configuration d'exécution.
 *
 * Variables (voir env.example, bloc `runtimeConfig` de nuxt.config.ts) :
 *  - `AI_PROVIDER`  : openai | anthropic | google | mistral | mock (défaut : openai)
 *  - `AI_MODEL`     : identifiant du modèle chez le fournisseur (défaut par fournisseur ci-dessous)
 *  - `AI_DAILY_QUOTA` : appels max par utilisateur et par jour (défaut : 50)
 *  - clés : `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `MISTRAL_API_KEY`
 *
 * Le fournisseur `mock` ne fait aucun appel réseau : il renvoie une recette
 * fixe (`./mock.ts`) pour le développement local et les tests.
 *
 * Pour ajouter un fournisseur : `npm i @ai-sdk/<nom>`, une entrée dans
 * `AI_PROVIDERS`, un cas dans `getModel`, sa clé dans `runtimeConfig`.
 */

export const AI_PROVIDERS = ['openai', 'anthropic', 'google', 'mistral', 'mock'] as const
export type AiProvider = (typeof AI_PROVIDERS)[number]

/** Modèle par défaut de chaque fournisseur (recommandations de docs/IA_MODELES.md). */
export const DEFAULT_MODELS: Readonly<Record<AiProvider, string>> = {
  openai: 'gpt-4.1-mini',
  anthropic: 'claude-haiku-4-5',
  google: 'gemini-2.5-flash',
  mistral: 'mistral-small-latest',
  mock: MOCK_MODEL_ID
}

export const DEFAULT_DAILY_QUOTA = 50

export interface AiConfig {
  provider: AiProvider
  model: string
  dailyQuota: number
  apiKey: string | null
}

/** Erreur de configuration serveur (clé absente, fournisseur inconnu) : jamais exposée telle quelle. */
export class AiConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AiConfigError'
  }
}

function isAiProvider(value: string): value is AiProvider {
  return (AI_PROVIDERS as readonly string[]).includes(value)
}

const asString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/**
 * Lit la configuration IA. Les clés sont lues dans `runtimeConfig` (surchargeable
 * par `NUXT_OPENAI_API_KEY`…) avec repli sur la variable d'environnement
 * historique (`OPENAI_API_KEY`), pour ne rien renommer sur Vercel.
 */
export function getAiConfig(event?: H3Event): AiConfig {
  const config = useRuntimeConfig(event)
  const providerRaw = asString(config.aiProvider) || asString(process.env.AI_PROVIDER) || 'openai'
  if (!isAiProvider(providerRaw)) {
    throw new AiConfigError(`AI_PROVIDER inconnu : « ${providerRaw} » (attendu : ${AI_PROVIDERS.join(', ')})`)
  }
  const provider = providerRaw
  const model = asString(config.aiModel) || asString(process.env.AI_MODEL) || DEFAULT_MODELS[provider]

  const quotaRaw = Number.parseInt(asString(config.aiDailyQuota) || asString(process.env.AI_DAILY_QUOTA), 10)
  const dailyQuota = Number.isFinite(quotaRaw) && quotaRaw >= 0 ? quotaRaw : DEFAULT_DAILY_QUOTA

  const keyByProvider: Record<AiProvider, string> = {
    openai: asString(config.openaiApiKey) || asString(process.env.OPENAI_API_KEY),
    anthropic: asString(config.anthropicApiKey) || asString(process.env.ANTHROPIC_API_KEY),
    google: asString(config.googleApiKey) || asString(process.env.GOOGLE_GENERATIVE_AI_API_KEY),
    mistral: asString(config.mistralApiKey) || asString(process.env.MISTRAL_API_KEY),
    mock: ''
  }
  const apiKey = keyByProvider[provider]

  return { provider, model, dailyQuota, apiKey: apiKey || null }
}

const PLACEHOLDER_KEYS = new Set(['your_openai_api_key_here', 'your-api-key', 'changeme'])

/** Instancie le modèle de langage du fournisseur configuré. */
export function getModel(config: AiConfig): LanguageModel {
  if (config.provider === 'mock') {
    return createMockRecipeModel()
  }

  const apiKey = config.apiKey
  if (!apiKey || PLACEHOLDER_KEYS.has(apiKey)) {
    throw new AiConfigError(`Clé API absente pour le fournisseur « ${config.provider} »`)
  }

  switch (config.provider) {
    case 'openai':
      return createOpenAI({ apiKey })(config.model)
    case 'anthropic':
      return createAnthropic({ apiKey })(config.model)
    case 'google':
      return createGoogleGenerativeAI({ apiKey })(config.model)
    case 'mistral':
      return createMistral({ apiKey })(config.model)
  }
}
