import { defineEventHandler, getHeader, getRequestURL, setResponseHeader } from 'h3'
import { assertCronSecret } from '../../utils/cron'
import { serviceClient } from '../../utils/serviceClient'
import { isEmailConfigured, readEmailConfig, sendRenderedEmail, templateContext } from '../../utils/email'
import { sendNotificationEmails, type ClaimedNotification, type NotificationEmailReport } from '../../utils/notificationEmails'

/**
 * GET /api/cron/notification-emails — tâche planifiée Vercel (`vercel.json`, une fois par jour sur le plan Hobby) : envoie un
 * e-mail de synthèse par personne pour ses demandes d'ami et invitations de groupe non lues des 48 dernières heures, si elle
 * accepte les e-mails (`profiles.notifications`). Protégée par `CRON_SECRET` (Authorization: Bearer). Sans Resend configuré :
 * ne réclame rien et répond `skipped`. Détail : DEVELOPER.md § 20.15.
 */
export default defineEventHandler(async (event): Promise<NotificationEmailReport> => {
  try {
    const config = useRuntimeConfig(event)
    assertCronSecret(getHeader(event, 'authorization'), String(config.cronSecret ?? process.env.CRON_SECRET ?? ''))
    setResponseHeader(event, 'Cache-Control', 'no-store')

    const email = readEmailConfig(config as Record<string, unknown>, process.env, getRequestURL(event).origin)
    const admin = isEmailConfigured(email) ? serviceClient(event) : null
    return await sendNotificationEmails({
      configured: admin !== null,
      context: templateContext(email),
      claim: async (limit) => {
        const { data, error } = await admin!.rpc('claim_notification_emails', { p_limit: limit })
        if (error) throw error
        return (data ?? []) as ClaimedNotification[]
      },
      confirm: async (ids) => {
        const { error } = await admin!.rpc('confirm_notification_emails', { p_ids: ids })
        if (error) throw error
      },
      release: async (ids) => {
        const { error } = await admin!.rpc('release_notification_emails', { p_ids: ids })
        if (error) throw error
      },
      send: (to, rendered) => sendRenderedEmail(email, to, rendered)
    })
  } catch (error: unknown) {
    handleApiError(error, 'cron.notification-emails')
  }
})
