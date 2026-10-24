import { classifyAiError } from './billing'

/**
 * Alerte « crédit IA épuisé » (phase 7, dossier §6.5) : à la première erreur de facturation du fournisseur, enregistre l'état
 * (`system_alerts`, clé `ai_credit`, RPC `report_ai_billing_error`) et, si la base répond « envoyer », prévient Nina par e-mail.
 * La base garantit au plus UN e-mail par 24 h, même avec plusieurs requêtes en parallèle (mise à jour atomique).
 * Ne lève jamais : un échec ici ne doit pas masquer l'erreur d'origine.
 */
export interface CreditAlertPorts {
  /** RPC service_role `report_ai_billing_error` : vrai = un e-mail doit partir. */
  report: () => Promise<boolean>
  /** Envoie l'e-mail à Nina (journalisé et ignoré sans configuration Resend). */
  sendAlert: () => Promise<unknown>
}

export type CreditAlertOutcome = 'ignored' | 'recorded' | 'recorded_and_notified' | 'failed'

export async function reportBillingFailure(ports: CreditAlertPorts, error: unknown): Promise<CreditAlertOutcome> {
  if (classifyAiError(error) !== 'billing') return 'ignored'
  let shouldMail: boolean
  try {
    shouldMail = await ports.report()
  } catch (reportError: unknown) {
    console.error('[api] ai : alerte de crédit non enregistrée', reportError)
    return 'failed'
  }
  if (!shouldMail) return 'recorded'
  try {
    await ports.sendAlert()
  } catch (mailError: unknown) {
    console.error('[api] ai : e-mail d\'alerte non envoyé', mailError)
    return 'failed'
  }
  return 'recorded_and_notified'
}
