import { emailLang, renderNotificationDigest, type NotificationItem, type TemplateContext } from './emailTemplates'
import type { SendResult } from './email'

/**
 * Envoi groupé des e-mails de notification (cron quotidien, phase 7).
 *
 * Pourquoi un cron plutôt qu'un Database Webhook : les notifications sont créées par des déclencheurs SQL (0023) ; un webhook
 * demanderait une adresse publique, un secret partagé et un traitement immédiat, alors que le plan Hobby de Vercel ne
 * permet qu'une tâche planifiée par jour, ce qui REGROUPE naturellement les e-mails (un seul e-mail de synthèse par personne
 * et par passage, plafond Resend gratuit de 100 par jour). La base décide qui reçoit quoi : `claim_notification_emails` ne
 * renvoie que les demandes d'ami et invitations de groupe non lues, récentes, dont la personne a `profiles.notifications`
 * vrai, et les réclament pour 10 minutes (bail `claimed_at`, pas de doublon entre deux passages) ; l'envoi réussi les marque `emailed_at`.
 *
 * Sans configuration Resend : on ne réclame RIEN (les notifications restent à envoyer tant qu'elles ont moins de 48 h).
 */
export interface ClaimedNotification {
  id: string
  user_id: string
  type: string
  payload: Record<string, unknown>
  language: string
  email: string
}

export interface NotificationEmailPorts {
  configured: boolean
  context: TemplateContext
  claim: (limit: number) => Promise<ClaimedNotification[]>
  /** Marque ces notifications « envoyées » (`emailed_at`) et lève le bail. */
  confirm: (ids: string[]) => Promise<void>
  /** Rend ces notifications à la file (lève le bail) : elles repartent au prochain passage. */
  release: (ids: string[]) => Promise<void>
  send: (to: string, rendered: { subject: string, html: string, text: string }) => Promise<SendResult>
  /** Horloge (ms), pour le budget de temps ; `Date.now` par défaut. */
  now?: () => number
}

export interface NotificationEmailReport {
  skipped: 'not_configured' | null
  claimed: number
  sent: number
  failed: number
  released: number
  /** Notifications laissées pour le passage suivant parce que le budget de temps était épuisé. */
  deferred: number
}

/**
 * Lot par passage et budget de temps, dimensionnés pour tenir dans la durée maximale d'une fonction Vercel du plan Hobby (60 s, ou
 * moins si la plateforme change) : un envoi Resend dure ~0,3 à 1 s et l'API limite à 2 requêtes par seconde. 40 notifications au
 * plus (donc 40 e-mails au plus), et plus aucun envoi après 40 s : le reste est rendu à la file (`finally`).
 * Le surplus (> 40 en attente) est pris aux passages suivants tant que la notification a moins de 48 h.
 */
export const NOTIFICATION_EMAIL_BATCH = 40
export const NOTIFICATION_EMAIL_BUDGET_MS = 40_000

export async function sendNotificationEmails(ports: NotificationEmailPorts): Promise<NotificationEmailReport> {
  const report: NotificationEmailReport = { skipped: null, claimed: 0, sent: 0, failed: 0, released: 0, deferred: 0 }
  if (!ports.configured) {
    console.warn('[email] notifications : Resend non configuré, rien n\'est envoyé')
    report.skipped = 'not_configured'
    return report
  }
  const now = ports.now ?? Date.now
  const startedAt = now()
  const rows = await ports.claim(NOTIFICATION_EMAIL_BATCH)
  report.claimed = rows.length

  // Tout ce qui est réclamé est soit confirmé (envoyé, ou inutile de réessayer), soit rendu à la file : jamais perdu. Le `finally`
  // couvre une exception en plein lot ; si le processus est tué (délai dépassé), le bail de `claim_notification_emails` expire seul.
  const settled = new Set<string>()
  try {
    // une personne = un e-mail (adresse du COMPTE destinataire, jamais celle d'un tiers)
    const byUser = new Map<string, ClaimedNotification[]>()
    for (const row of rows) byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row])

    for (const group of byUser.values()) {
      const ids = group.map(row => row.id)
      if (now() - startedAt > NOTIFICATION_EMAIL_BUDGET_MS) {
        report.deferred += ids.length
        continue   // laissé non confirmé : rendu à la file par le `finally`
      }
      const first = group[0]!
      const items: NotificationItem[] = group.map(row => ({ type: row.type, payload: row.payload ?? {} }))
      const rendered = renderNotificationDigest(emailLang(first.language), items, ports.context)
      if (!rendered) {
        await ports.confirm(ids)   // rien à envoyer pour ces types : inutile de les reprendre
        ids.forEach(id => settled.add(id))
        continue
      }
      const result = await ports.send(first.email, rendered)
      if (result.status === 'failed') {
        report.failed += 1   // réessai au prochain passage : non confirmé, rendu à la file par le `finally`
        continue
      }
      if (result.status === 'sent') report.sent += 1
      await ports.confirm(ids)   // envoyé (ou destinataire invalide : un réessai ne servirait à rien)
      ids.forEach(id => settled.add(id))
    }
  } finally {
    const pending = rows.map(row => row.id).filter(id => !settled.has(id))
    if (pending.length > 0) {
      await ports.release(pending).catch(error => console.error('[email] notifications : remise en attente impossible (le bail expirera)', error))
      report.released = pending.length
    }
  }
  return report
}
