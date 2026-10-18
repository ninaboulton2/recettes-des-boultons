import { z } from 'zod'

/**
 * Schémas des traductions de recettes (migration 0016).
 *
 *  - `translationDraftSchema` : traduction telle que l'API l'accepte et la
 *    renvoie (`POST /api/add-recipe`, réponses du traducteur).
 *  - `aiTranslationSchema` : forme imposée au modèle (`generateObject`). Mêmes
 *    règles que `aiRecipeSchema` : aucun champ optionnel, `nullable` pour ce
 *    qui peut manquer, pas de contrainte de longueur.
 */

export const recipeLangSchema = z.enum(['fr', 'en'], { errorMap: () => ({ message: 'doit être fr ou en' }) })

const text = (max: number) => z.string({ invalid_type_error: 'doit être du texte' }).max(max, `trop long (max ${max} caractères)`)

export const translationDraftSchema = z.object({
  title: text(200).trim().min(1, 'requis'),
  description: text(2000).nullish().transform(value => value ?? null),
  notes: text(5000).nullish().transform(value => value ?? null),
  tags: z.array(text(50)).max(50, 'trop de tags').default([]),
  content: z.object({
    sections: z.array(z.object({
      name: text(200),
      ingredients: z.array(z.object({
        name: text(200),
        amount: text(50).nullish().transform(value => value ?? null),
        unit: text(50).nullish().transform(value => value ?? null)
      })).max(300, 'trop d\'ingrédients'),
      instructions: z.array(text(5000)).max(300, 'trop d\'étapes')
    })).max(50, 'trop de sections (max 50)')
  })
})

export type TranslationDraftInput = z.infer<typeof translationDraftSchema>

export const aiTranslationIngredientSchema = z.object({
  name: z.string().describe('Nom de l\'ingrédient traduit, sans quantité ni unité'),
  amount: z.string().nullable()
    .describe('Quantité traduite SEULEMENT si la quantité d\'origine contient des mots (« au goût », « 2 à 3 », « une pincée ») ; null sinon'),
  unit: z.string().nullable()
    .describe('Unité en texte libre traduite, seulement si l\'unité d\'origine en est une ; null sinon')
})

export const aiTranslationSectionSchema = z.object({
  name: z.string().describe('Titre de la sous-section traduit (chaîne vide si l\'original est vide)'),
  ingredients: z.array(aiTranslationIngredientSchema)
    .describe('Les mêmes ingrédients que la section d\'origine, dans le même ordre, même nombre'),
  instructions: z.array(z.string())
    .describe('Les mêmes étapes que la section d\'origine, dans le même ordre, même nombre')
})

export const aiTranslationSchema = z.object({
  title: z.string(),
  description: z.string().nullable().describe('Description traduite, null si l\'original n\'en a pas'),
  notes: z.string().nullable().describe('Notes traduites, null si l\'original n\'en a pas'),
  tags: z.array(z.string()).describe('Tags traduits, dans le même ordre, même nombre'),
  sections: z.array(aiTranslationSectionSchema)
    .describe('Les mêmes sections que la recette d\'origine, dans le même ordre, même nombre')
})

export type AiTranslation = z.infer<typeof aiTranslationSchema>

/** Sortie du modèle pour une recette existante : langue détectée + traduction vers l'autre langue. */
export const aiTranslateExistingSchema = z.object({
  sourceLanguage: recipeLangSchema.describe('Langue du texte d\'origine : fr ou en'),
  translation: aiTranslationSchema
})

export type AiTranslateExisting = z.infer<typeof aiTranslateExistingSchema>

/** Corps de `POST /api/translations/run` (page « Traductions »). */
export const runTranslationsBodySchema = z.object({
  /** Recettes traitées par requête (une requête serveur est limitée à 30 s). */
  limit: z.number({ invalid_type_error: 'doit être un nombre' }).int('doit être un entier')
    .min(1, 'min 1').max(3, 'max 3').default(1),
  /** Recettes à ignorer (échecs précédents de la même exécution). */
  exclude: z.array(z.string().uuid('identifiant invalide')).max(500, 'trop d\'identifiants').default([]),
  /** Restreint le traitement à ces recettes (outil / tests) ; absent = toutes celles qui en ont besoin. */
  ids: z.array(z.string().uuid('identifiant invalide')).max(50, 'trop d\'identifiants').optional()
})

export type RunTranslationsBody = z.infer<typeof runTranslationsBodySchema>

export type TranslationOutcomeStatus = 'translated' | 'unchanged' | 'failed' | 'provided'

/** Résultat de traduction joint aux réponses de `add-recipe` / `update-recipe`. */
export interface TranslationResult {
  status: TranslationOutcomeStatus
  lang?: 'fr' | 'en'
  /** Présents quand `status = 'failed'`. */
  reason?: 'quota' | 'config' | 'provider' | 'ai' | 'save'
  message?: string
}

/** Pourquoi une traduction a échoué (voir `server/utils/translations.ts`). */
export type TranslationFailureReason = 'quota' | 'config' | 'provider' | 'ai' | 'save'

/** Réponse de `GET /api/translations` : état des traductions et coûts. */
export interface TranslationStatus {
  total: number
  /** Traduction à jour. */
  translated: number
  /** Traduction existante mais périmée (texte modifié depuis). */
  stale: number
  /** Pas de traduction. */
  missing: number
  /** Appels de traduction journalisés (`ai_usage`, feature `translate_recipe`). */
  calls: number
  failedCalls: number
  /** Coût cumulé estimé en USD. */
  costUsd: number
  /** Coût moyen par appel réussi (repli : estimation gpt-4.1-mini). */
  averageCostUsd: number
  /** Coût estimé de ce qui reste à traduire. */
  estimatedRemainingUsd: number
  /** Quota journalier configuré (`AI_DAILY_QUOTA`). */
  dailyQuota: number
  provider: string
  model: string
}

/** Réponse de `POST /api/translations/run`. */
export interface RunTranslationsResponse {
  success: true
  results: Array<{
    id: string
    title: string
    status: 'translated' | 'unchanged' | 'failed'
    lang?: 'fr' | 'en'
    reason?: TranslationFailureReason
    message?: string
  }>
  /** Renseigné quand le traitement doit s'arrêter (quota, clé IA, crédit épuisé). */
  stopped: { reason: TranslationFailureReason, message: string } | null
  status: TranslationStatus
}
