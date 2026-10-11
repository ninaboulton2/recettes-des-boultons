/**
 * Grille tarifaire des modèles (USD par million de tokens), utilisée pour
 * estimer le coût de chaque appel journalisé dans `ai_usage`.
 *
 * Prix relevés le 2026-10-03 sur les pages officielles (voir docs/IA_MODELES.md
 * pour les URL). Tarif « standard » (pas de batch, pas de cache). Un modèle
 * absent de la grille donne un coût `null` (journalisé quand même).
 *
 * À mettre à jour quand on change de modèle ou que les prix bougent : la date
 * est exposée dans `PRICING_DATE` pour que le comparatif reste honnête.
 */

export const PRICING_DATE = '2026-10-03'

export interface ModelPricing {
  /** USD / 1M tokens en entrée. */
  input: number
  /** USD / 1M tokens en sortie (tokens de raisonnement inclus pour les modèles « reasoning »). */
  output: number
}

export const MODEL_PRICING: Readonly<Record<string, ModelPricing>> = {
  // OpenAI — https://developers.openai.com/api/docs/pricing
  'gpt-4.1-mini': { input: 0.40, output: 1.60 },
  'gpt-4.1-nano': { input: 0.10, output: 0.40 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-5-mini': { input: 0.25, output: 2.00 },
  'gpt-5-nano': { input: 0.05, output: 0.40 },
  'gpt-5.4-mini': { input: 0.75, output: 4.50 },
  'gpt-5.4-nano': { input: 0.20, output: 1.25 },
  // Anthropic — https://platform.claude.com/docs/en/about-claude/pricing
  'claude-haiku-4-5': { input: 1.00, output: 5.00 },
  'claude-sonnet-5': { input: 2.00, output: 10.00 },
  // Google — https://ai.google.dev/gemini-api/docs/pricing
  'gemini-2.5-flash': { input: 0.30, output: 2.50 },
  'gemini-2.5-flash-lite': { input: 0.10, output: 0.40 },
  // Mistral — https://mistral.ai/pricing#api-pricing
  'mistral-small-latest': { input: 0.15, output: 0.60 },
  'mistral-small-2603': { input: 0.15, output: 0.60 },
  'mistral-medium-latest': { input: 1.50, output: 7.50 },
  // Fournisseur simulé (dev / tests)
  'mock-recipe': { input: 0, output: 0 }
}

/** Retire un suffixe de version daté (`gpt-4.1-mini-2025-04-14` → `gpt-4.1-mini`). */
function baseModelId(model: string): string {
  return model.replace(/-\d{4}-\d{2}-\d{2}$/, '').replace(/-\d{8}$/, '')
}

export function getModelPricing(model: string): ModelPricing | null {
  return MODEL_PRICING[model] ?? MODEL_PRICING[baseModelId(model)] ?? null
}

/**
 * Coût estimé (USD, 6 décimales) d'un appel, `null` si le modèle est inconnu
 * ou si le fournisseur n'a pas renvoyé de comptage.
 */
export function estimateCostUsd(model: string, inputTokens: number | undefined, outputTokens: number | undefined): number | null {
  const pricing = getModelPricing(model)
  if (!pricing || inputTokens === undefined || outputTokens === undefined) return null
  const cost = (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000
  return Math.round(cost * 1_000_000) / 1_000_000
}

/**
 * Transcription audio : USD par minute d'audio (modèles facturés au temps, pas
 * aux tokens). Mêmes sources et même date que la grille ci-dessus.
 */
export const TRANSCRIPTION_PRICING_PER_MINUTE: Readonly<Record<string, number>> = {
  'gpt-4o-mini-transcribe': 0.003,
  'gpt-4o-transcribe': 0.006,
  'whisper-1': 0.006,
  // Fournisseur simulé (dev / tests)
  'mock-transcribe': 0
}

/** Coût estimé (USD, 6 décimales) de la transcription de `seconds` secondes d'audio, `null` si le modèle est inconnu. */
export function estimateTranscriptionCostUsd(model: string, seconds: number): number | null {
  const perMinute = TRANSCRIPTION_PRICING_PER_MINUTE[model] ?? TRANSCRIPTION_PRICING_PER_MINUTE[baseModelId(model)]
  if (perMinute === undefined || !Number.isFinite(seconds) || seconds < 0) return null
  return Math.round((seconds / 60) * perMinute * 1_000_000) / 1_000_000
}
