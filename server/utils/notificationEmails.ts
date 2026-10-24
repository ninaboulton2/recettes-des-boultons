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
 * vrai, et les marque `emailed_at` (pas de doublon entre deux passages).
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
  release: (ids: string[]) => Promise<void>
  send: (to: string, rendered: { subject: string, html: string, text: string }) => Promise<SendResult>
}

export interface NotificationEmailReport {
  skipped: 'not_configured' | null
  claimed: number
  sent: number
  failed: number
  released: number
}

export const NOTIFICATION_EMAIL_BATCH = 200

export async function sendNotificationEmails(ports: NotificationEmailPorts): Promise<NotificationEmailReport> {
  const report: NotificationEmailReport = { skipped: null, claimed: 0, sent: 0, failed: 0, released: 0 }
  if (!ports.configured) {
    console.warn('[email] notifications : Resend non configuré, rien n\'est envoyé')
    report.skipped = 'not_configured'
    return report
  }
  const rows = await ports.claim(NOTIFICATION_EMAIL_BATCH)
  report.claimed = rows.length

  // une personne = un e-mail (adresse du COMPTE destinataire, jamais celle d'un tiers)
  const byUser = new Map<string, ClaimedNotification[]>()
  for (const row of rows) byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row])

  const toRelease: string[] = []
  for (const group of byUser.values()) {
    const first = group[0]!
    const items: NotificationItem[] = group.map(row => ({ type: row.type, payload: row.payload ?? {} }))
    const rendered = renderNotificationDigest(emailLang(first.language), items, ports.context)
    if (!rendered) continue
    const result = await ports.send(first.email, rendered)
    if (result.status === 'sent') {
      report.sent += 1
    } else if (result.status === 'failed') {
      report.failed += 1
      toRelease.push(...group.map(row => row.id))   // réessai au prochain passage
    }
  }
  if (toRelease.length > 0) {
    await ports.release(toRelease).catch(error => console.error('[email] notifications : remise en attente impossible', error))
    report.released = toRelease.length
  }
  return report
}
