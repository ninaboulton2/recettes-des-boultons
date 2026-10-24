import { z } from 'zod'
import { uuidSchema } from './common'

/**
 * Signalements de contenu (table `reports`, 0017 ; politiques de 0019 ; limite de 10 par jour en 0023 ; RPC `report_shared_recipe`, 0027).
 * Valident ce que l'interface envoie ; la base refuse de toute façon un motif inconnu, des détails trop longs (2000) ou la 11e demande du jour.
 */

export const REPORT_REASONS = ['illegal', 'copyright', 'spam', 'other'] as const
export const reportReasonSchema = z.enum(REPORT_REASONS, { errorMap: () => ({ message: 'motif inconnu' }) })
export type ReportReason = z.infer<typeof reportReasonSchema>

export const REPORT_DETAILS_MAX = 2000

/** Détails facultatifs : espaces de bord retirés, vide = absent. */
const reportDetails = z.string({ invalid_type_error: 'doit être du texte' })
  .trim().max(REPORT_DETAILS_MAX, `trop long (max ${REPORT_DETAILS_MAX} caractères)`)
  .optional().transform(value => (value === undefined || value === '' ? undefined : value))

/** Signaler une recette que je peux lire (fiche) : insertion directe dans `reports`. */
export const createReportInputSchema = z.object({ recipeId: uuidSchema, reason: reportReasonSchema, details: reportDetails })

/** Signaler la recette d'un lien public (page `/r/<jeton>`) : RPC `report_shared_recipe`. */
export const reportSharedRecipeInputSchema = z.object({ token: uuidSchema, reason: reportReasonSchema, details: reportDetails })

/** Traitement par le support (écran `/support/signalements`). */
export const REPORT_STATUSES = ['open', 'reviewed', 'actioned', 'dismissed'] as const
export const reportStatusSchema = z.enum(REPORT_STATUSES)
export type ReportStatus = z.infer<typeof reportStatusSchema>

export const setReportStatusInputSchema = z.object({
  reportId: uuidSchema,
  status: z.enum(['reviewed', 'actioned', 'dismissed'], { errorMap: () => ({ message: 'statut inconnu' }) })
})

export type CreateReportInput = z.input<typeof createReportInputSchema>
export type ReportSharedRecipeInput = z.input<typeof reportSharedRecipeInputSchema>
