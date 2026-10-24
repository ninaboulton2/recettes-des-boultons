/**
 * Compte (phase 6D), logique pure et testable sans Nuxt : fichier d'export, classement des échecs de suppression,
 * confirmation par l'adresse e-mail, mode de reconnexion. Règles d'AFFICHAGE : le serveur et la base décident
 * (400 adresse différente, 401 REAUTH_REQUIRED, 409 groupes à transférer, 54000 limite d'exports).
 */

export const EXPORT_DAILY_LIMIT = 3
export const EXPORT_FORMAT_VERSION = 1

export interface ExportFile {
  filename: string
  mime: string
  content: string
}

const pad = (n: number) => String(n).padStart(2, '0')

/** `mes-donnees-recettes-2026-10-24.json` (date locale de la personne). */
export function exportFilename(now: Date): string {
  return `mes-donnees-recettes-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`
}

/**
 * Fichier JSON lisible (indenté, UTF-8, accents conservés) : les données de `export_my_data()` telles quelles sous `data`,
 * précédées d'une courte description (date, version du format). Aucun e-mail d'autrui ni identifiant de personne :
 * c'est ce que la base renvoie, rien n'est ajouté ici.
 */
export function buildExportFile(data: unknown, now: Date = new Date()): ExportFile {
  const document = {
    export: {
      generated_at: now.toISOString(),
      format_version: EXPORT_FORMAT_VERSION,
      note: 'Export de mes données (RGPD, droit à la portabilité). Les autres personnes n\'y figurent que par leur pseudonyme.'
    },
    data
  }
  return { filename: exportFilename(now), mime: 'application/json;charset=utf-8', content: `${JSON.stringify(document, null, 2)}\n` }
}

export type ExportErrorKey = 'settings.export.errors.rate' | 'errors.generic'

/** 54000 = les 3 exports du jour sont faits. Tout le reste : message générique (jamais le texte de la base). */
export function exportErrorKey(error: unknown): ExportErrorKey {
  const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined
  return code === '54000' ? 'settings.export.errors.rate' : 'errors.generic'
}

/** Même adresse, sans tenir compte de la casse ni des espaces de bord (le serveur compare de la même façon). */
export function emailMatches(typed: string, accountEmail: string | null | undefined): boolean {
  const wanted = (accountEmail ?? '').trim().toLowerCase()
  return wanted !== '' && typed.trim().toLowerCase() === wanted
}

export type DeletionFailure =
  | { kind: 'reauth' }
  | { kind: 'blockers' }
  | { kind: 'mismatch' }
  | { kind: 'generic' }

/**
 * Classe l'échec de `POST /api/account/delete` (`ApiError` : `statusCode`, `code`) :
 * 401 `REAUTH_REQUIRED` → redemander la connexion puis réessayer ; 409 → un groupe est à transférer (relire les blocages) ;
 * 400 → l'adresse saisie ne correspond pas ; tout le reste → message générique.
 */
export function classifyDeletionError(error: unknown): DeletionFailure {
  const e = typeof error === 'object' && error !== null ? error as { statusCode?: unknown, code?: unknown } : {}
  if (e.statusCode === 401 && e.code === 'REAUTH_REQUIRED') return { kind: 'reauth' }
  if (e.statusCode === 409) return { kind: 'blockers' }
  if (e.statusCode === 400) return { kind: 'mismatch' }
  return { kind: 'generic' }
}

/**
 * La personne a-t-elle un mot de passe ? Les fournisseurs de connexion sont dans `app_metadata.providers` du jeton
 * (`email`, `google`…). Sans mot de passe (Google seul), la reconnexion passe par Google : le formulaire de mot de passe n'a pas de sens.
 */
export function hasPasswordLogin(claims: { app_metadata?: unknown } | null | undefined): boolean {
  const meta = claims?.app_metadata
  if (typeof meta !== 'object' || meta === null) return false
  const providers = (meta as { providers?: unknown }).providers
  if (Array.isArray(providers)) return providers.includes('email')
  return (meta as { provider?: unknown }).provider === 'email'
}
