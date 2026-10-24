import { renderAiCreditAlert, type AiAlertData, type RenderedEmail, type TemplateContext } from './emailTemplates'

/**
 * Envoi d'e-mails transactionnels par Resend (phase 7, dossier §6.3). Tout passe par des variables d'environnement :
 *  - `RESEND_API_KEY` : clé d'API Resend (serveur seulement) ;
 *  - `EMAIL_FROM`     : expéditeur sur un domaine VÉRIFIÉ dans Resend, ex. `Recettes <no-reply@mondomaine.com>` ;
 *  - `ALERT_EMAIL`    : adresse de Nina pour l'alerte de crédit (jamais en dur dans le code) ;
 *  - `SITE_URL`       : adresse publique de l'application (liens des e-mails) ; à défaut, l'adresse de la requête.
 *
 * SANS CLÉ OU SANS EXPÉDITEUR : aucun envoi, une ligne de journal côté serveur (sans adresse ni contenu), aucune erreur pour la
 * personne : l'application fonctionne pareil (le domaine n'est pas encore acheté). Un échec d'envoi ne lève jamais non plus.
 */

export interface EmailConfig {
  apiKey: string
  from: string
  alertEmail: string
  siteUrl: string
  appName: string
}

export interface EmailMessage {
  to: string
  subject: string
  html: string
  text: string
}

export type SendResult
  = | { status: 'sent', id: string | null }
    | { status: 'skipped', reason: 'not_configured' | 'invalid_recipient' }
    | { status: 'failed', reason: string }

export type FetchLike = (input: string, init: { method: string, headers: Record<string, string>, body: string, signal?: AbortSignal }) => Promise<{ ok: boolean, status: number, json: () => Promise<unknown> }>

export const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const SEND_TIMEOUT_MS = 8000
const DEFAULT_APP_NAME = 'Recettes'

const asString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/**
 * Lit la configuration : `runtimeConfig` d'abord (surchargeable par `NUXT_RESEND_API_KEY`…), repli sur la variable d'environnement
 * historique (`RESEND_API_KEY`) comme `getAiConfig`. `fallbackSiteUrl` = origine de la requête.
 */
export function readEmailConfig(runtimeConfig: Record<string, unknown>, env: Record<string, string | undefined> = process.env, fallbackSiteUrl = ''): EmailConfig {
  return {
    apiKey: asString(runtimeConfig.resendApiKey) || asString(env.RESEND_API_KEY),
    from: asString(runtimeConfig.emailFrom) || asString(env.EMAIL_FROM),
    alertEmail: asString(runtimeConfig.alertEmail) || asString(env.ALERT_EMAIL),
    siteUrl: asString(runtimeConfig.siteUrl) || asString(env.SITE_URL) || fallbackSiteUrl,
    appName: asString(runtimeConfig.emailAppName) || asString(env.EMAIL_APP_NAME) || DEFAULT_APP_NAME
  }
}

export const isEmailConfigured = (config: EmailConfig): boolean => config.apiKey !== '' && config.from !== ''
export const templateContext = (config: EmailConfig): TemplateContext => ({ siteUrl: config.siteUrl, appName: config.appName })

const EMAIL_SHAPE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/

/** Envoie un e-mail. Ne lève jamais : renvoie `sent`, `skipped` (non configuré, destinataire invalide) ou `failed`. */
export async function sendEmail(config: EmailConfig, message: EmailMessage, fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike): Promise<SendResult> {
  if (!isEmailConfigured(config)) {
    console.warn(`[email] non envoyé (Resend non configuré) : « ${message.subject} »`)
    return { status: 'skipped', reason: 'not_configured' }
  }
  if (!EMAIL_SHAPE.test(message.to)) {
    console.warn('[email] non envoyé : destinataire invalide')
    return { status: 'skipped', reason: 'invalid_recipient' }
  }
  try {
    const response = await fetchImpl(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.from, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS)
    })
    if (!response.ok) {
      console.error(`[email] Resend a refusé l'envoi (HTTP ${response.status}) : « ${message.subject} »`)
      return { status: 'failed', reason: `http_${response.status}` }
    }
    const body = await response.json().catch(() => null)
    const id = typeof body === 'object' && body !== null && typeof (body as { id?: unknown }).id === 'string' ? (body as { id: string }).id : null
    return { status: 'sent', id }
  } catch (error: unknown) {
    console.error('[email] envoi impossible', error instanceof Error ? error.name : 'erreur')
    return { status: 'failed', reason: 'network' }
  }
}

export function sendRenderedEmail(config: EmailConfig, to: string, rendered: RenderedEmail, fetchImpl?: FetchLike): Promise<SendResult> {
  return sendEmail(config, { to, ...rendered }, fetchImpl)
}

/** Alerte pour Nina (crédit IA épuisé, ou budget du mois atteint). Sans `ALERT_EMAIL`, journalisée et ignorée. */
export async function sendAiCreditAlert(config: EmailConfig, data: AiAlertData, fetchImpl?: FetchLike): Promise<SendResult> {
  const rendered = renderAiCreditAlert({ billingUrl: 'https://platform.openai.com/settings/organization/billing/overview', ...data }, templateContext(config))
  if (config.alertEmail === '') {
    console.warn(`[email] alerte non envoyée (ALERT_EMAIL absent) : « ${rendered.subject} »`)
    return { status: 'skipped', reason: 'not_configured' }
  }
  return sendRenderedEmail(config, config.alertEmail, rendered, fetchImpl)
}
