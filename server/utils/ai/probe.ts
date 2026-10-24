import { classifyAiError } from './billing'

/**
 * Rattrapage du crédit IA (tâche planifiée quotidienne, phase 7). Tant que l'alerte `ai_credit` est active, un appel d'essai
 * MINIMAL (un mot en entrée, 16 jetons en sortie au plus : de l'ordre de 0,000003 $) vérifie si le fournisseur répond de nouveau ;
 * si oui, l'alerte est levée. Sans alerte active : aucun appel, aucun coût. Le fournisseur `mock` répond toujours.
 */
export interface ProbePorts {
  isAlertActive: () => Promise<boolean>
  callProvider: () => Promise<void>
  resetAlert: () => Promise<boolean>
  recordBillingFailure: () => Promise<unknown>
}

export type ProbeOutcome
  = | { status: 'idle' }
    | { status: 'reset', changed: boolean }
    | { status: 'still_exhausted' }
    | { status: 'error', kind: string }

export async function probeAiCredit(ports: ProbePorts): Promise<ProbeOutcome> {
  if (!(await ports.isAlertActive())) return { status: 'idle' }
  try {
    await ports.callProvider()
  } catch (error: unknown) {
    const kind = classifyAiError(error)
    if (kind === 'billing') {
      await ports.recordBillingFailure().catch(() => undefined)
      return { status: 'still_exhausted' }
    }
    console.error('[cron] ai-credit-probe : appel d\'essai en erreur', kind)
    return { status: 'error', kind }
  }
  return { status: 'reset', changed: await ports.resetAlert() }
}
