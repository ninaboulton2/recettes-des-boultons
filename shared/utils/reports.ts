import { REPORT_REASONS, type ReportReason, type ReportStatus } from '#shared/schemas/reports'

/**
 * Signalements (phase 6E), logique pure et testable sans Nuxt : messages d'erreur selon le SQLSTATE, forme des lignes
 * de l'écran support, actions permises selon le statut. Règles d'AFFICHAGE : la base décide (42501, 54000, RLS).
 */

export const REPORT_DAILY_LIMIT = 10

export type ReportErrorKey = 'errors.report.rate' | 'errors.report.notFound' | 'errors.report.forbidden' | 'errors.report.invalid' | 'errors.generic'

/**
 * Message d'un échec de signalement. Le texte technique de la base (en français seulement) n'est jamais affiché :
 * 54000 = les 10 signalements du jour sont faits ; P0002 = lien ou recette introuvable (révoqué entre-temps) ;
 * 42501 = connexion requise ou recette illisible ; 22023 / 23514 / 23503 = entrée refusée (motif, longueur, recette supprimée).
 */
export function reportErrorKey(error: unknown): ReportErrorKey {
  const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined
  switch (code) {
    case '54000': return 'errors.report.rate'
    case 'P0002': return 'errors.report.notFound'
    case '42501': return 'errors.report.forbidden'
    case '22023':
    case '23514':
    case '23503': return 'errors.report.invalid'
    default: return 'errors.generic'
  }
}

export const isReportReason = (value: unknown): value is ReportReason =>
  typeof value === 'string' && (REPORT_REASONS as readonly string[]).includes(value)

// ---------------------------------------------------------------- écran support

export interface SupportReportRow {
  id: string
  recipe_id: string | null
  reason: string
  details: string | null
  status: string
  created_at: string
  handled_at: string | null
  /** Jointure PostgREST : la recette si elle existe encore (et si le support peut la lire : signalement ouvert ou examiné). */
  recipes?: { id: string, title: string | null } | Array<{ id: string, title: string | null }> | null
}

export interface SupportReport {
  id: string
  recipeId: string | null
  recipeTitle: string | null
  reason: ReportReason | 'unknown'
  details: string | null
  status: ReportStatus
  createdAt: string
  handledAt: string | null
}

const STATUSES: readonly string[] = ['open', 'reviewed', 'actioned', 'dismissed']

export function toSupportReport(row: SupportReportRow): SupportReport {
  const joined = Array.isArray(row.recipes) ? row.recipes[0] : row.recipes
  return {
    id: row.id,
    recipeId: row.recipe_id ?? null,
    recipeTitle: joined?.title ?? null,
    reason: isReportReason(row.reason) ? row.reason : 'unknown',
    details: row.details?.trim() ? row.details : null,
    status: STATUSES.includes(row.status) ? row.status as ReportStatus : 'open',
    createdAt: row.created_at,
    handledAt: row.handled_at ?? null
  }
}

export type SupportAction = 'reviewed' | 'actioned' | 'dismissed'

/** Passages proposés au support : un signalement traité (actioned / dismissed) ne se rouvre pas depuis l'écran. */
export function supportActions(status: ReportStatus): SupportAction[] {
  if (status === 'open') return ['reviewed', 'actioned', 'dismissed']
  if (status === 'reviewed') return ['actioned', 'dismissed']
  return []
}

/** Les signalements affichés à traiter : ouverts d'abord (les plus anciens en tête), puis examinés. */
export function sortSupportReports(reports: SupportReport[]): SupportReport[] {
  const rank = (status: ReportStatus) => (status === 'open' ? 0 : 1)
  return [...reports].sort((a, b) => rank(a.status) - rank(b.status) || a.createdAt.localeCompare(b.createdAt))
}
