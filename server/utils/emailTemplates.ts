/**
 * Gabarits d'e-mails (phase 7), français / anglais selon `profiles.language`. Texte simple, sans image ni suivi.
 *
 * Règles de contenu : jamais d'adresse e-mail (ni la nôtre, ni celle d'un tiers), jamais le contenu d'une recette ; seulement
 * un pseudonyme et un nom de groupe (ce que la personne verrait dans la cloche de l'application), un lien vers l'application
 * et le rappel de la façon de couper ces e-mails. Tout ce qui vient de la base est échappé (HTML) et borné.
 */
export type EmailLang = 'fr' | 'en'

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

export interface NotificationItem {
  type: string
  payload: Record<string, unknown>
}

const MAX_NAME = 60

export const escapeHtml = (value: string): string => value
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/** Texte venant de la base : sans retour à la ligne ni caractère de contrôle, borné. */
export function cleanName(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (cleaned === '') return fallback
  return cleaned.length > MAX_NAME ? `${cleaned.slice(0, MAX_NAME - 1)}…` : cleaned
}

export const emailLang = (value: unknown): EmailLang => (value === 'en' ? 'en' : 'fr')

/** Adresse de l'application dans la langue de la personne (`/en/…` pour l'anglais, comme `prefix_except_default`). */
export function appLink(siteUrl: string, lang: EmailLang, path: string): string {
  const base = siteUrl.replace(/\/+$/, '')
  return `${base}${lang === 'en' ? '/en' : ''}${path}`
}

interface Block {
  title: string
  lines: string[]
  link: { label: string, url: string }
  footer: string
}

function layout(lang: EmailLang, block: Block): { html: string, text: string } {
  const paragraphs = block.lines.map(line => `<p style="margin:0 0 12px">${escapeHtml(line)}</p>`).join('')
  const html = `<!doctype html><html lang="${lang}"><body style="margin:0;padding:24px;background:#f6f6f4;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#222">`
    + `<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:24px">`
    + `<h1 style="margin:0 0 16px;font-size:18px">${escapeHtml(block.title)}</h1>${paragraphs}`
    + `<p style="margin:20px 0"><a href="${escapeHtml(block.link.url)}" style="background:#2f6f62;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;display:inline-block">${escapeHtml(block.link.label)}</a></p>`
    + `<p style="margin:16px 0 0;font-size:12px;color:#666">${escapeHtml(block.footer)}</p></div></body></html>`
  const text = [block.title, '', ...block.lines, '', `${block.link.label} : ${block.link.url}`, '', block.footer].join('\n')
  return { html, text }
}

const FOOTER = {
  fr: (url: string) => `Vous recevez ce message parce que les notifications par e-mail sont activées. Vous pouvez les couper dans Réglages : ${url}`,
  en: (url: string) => `You are receiving this because email notifications are turned on. You can turn them off in Settings: ${url}`
} as const

export interface TemplateContext {
  siteUrl: string
  appName: string
}

export function renderGroupInvitation(lang: EmailLang, data: { fromName?: unknown, groupName?: unknown }, ctx: TemplateContext): RenderedEmail {
  const from = cleanName(data.fromName, lang === 'en' ? 'Someone' : 'Quelqu\'un')
  const group = cleanName(data.groupName, lang === 'en' ? 'a group' : 'un groupe')
  const link = appLink(ctx.siteUrl, lang, '/notifications')
  const settings = appLink(ctx.siteUrl, lang, '/reglages')
  const subject = lang === 'en' ? `${from} invites you to join the group “${group}”` : `${from} vous invite à rejoindre le groupe « ${group} »`
  const block: Block = lang === 'en'
    ? { title: subject, lines: [`${from} invited you to join the group “${group}” on ${ctx.appName}.`, 'Open your notifications to accept or decline.'], link: { label: 'See the invitation', url: link }, footer: FOOTER.en(settings) }
    : { title: subject, lines: [`${from} vous a invité(e) à rejoindre le groupe « ${group} » sur ${ctx.appName}.`, 'Ouvrez vos notifications pour accepter ou refuser.'], link: { label: 'Voir l\'invitation', url: link }, footer: FOOTER.fr(settings) }
  return { subject, ...layout(lang, block) }
}

export function renderFriendRequest(lang: EmailLang, data: { fromName?: unknown }, ctx: TemplateContext): RenderedEmail {
  const from = cleanName(data.fromName, lang === 'en' ? 'Someone' : 'Quelqu\'un')
  const link = appLink(ctx.siteUrl, lang, '/amis')
  const settings = appLink(ctx.siteUrl, lang, '/reglages')
  const subject = lang === 'en' ? `${from} sent you a friend request` : `${from} vous a envoyé une demande d'ami`
  const block: Block = lang === 'en'
    ? { title: subject, lines: [`${from} would like to be your friend on ${ctx.appName}.`, 'Open your friends page to accept or decline.'], link: { label: 'See the request', url: link }, footer: FOOTER.en(settings) }
    : { title: subject, lines: [`${from} souhaite devenir votre ami(e) sur ${ctx.appName}.`, 'Ouvrez la page Amis pour accepter ou refuser.'], link: { label: 'Voir la demande', url: link }, footer: FOOTER.fr(settings) }
  return { subject, ...layout(lang, block) }
}

/**
 * Un seul e-mail par personne et par passage : le gabarit précis s'il n'y a qu'une notification, sinon une liste.
 * (Le plan gratuit de Resend est limité à 100 e-mails par jour, et la tâche planifiée Hobby ne tourne qu'une fois par jour.)
 */
export function renderNotificationDigest(lang: EmailLang, items: NotificationItem[], ctx: TemplateContext): RenderedEmail | null {
  if (items.length === 0) return null
  if (items.length === 1) {
    const item = items[0]!
    if (item.type === 'group_invitation') return renderGroupInvitation(lang, { fromName: item.payload.from_name, groupName: item.payload.group_name }, ctx)
    if (item.type === 'friend_request') return renderFriendRequest(lang, { fromName: item.payload.from_name }, ctx)
    return null
  }
  const lines = items.map((item) => {
    const from = cleanName(item.payload.from_name, lang === 'en' ? 'Someone' : 'Quelqu\'un')
    if (item.type === 'group_invitation') {
      const group = cleanName(item.payload.group_name, lang === 'en' ? 'a group' : 'un groupe')
      return lang === 'en' ? `${from} invited you to join the group “${group}”.` : `${from} vous invite à rejoindre le groupe « ${group} ».`
    }
    return lang === 'en' ? `${from} sent you a friend request.` : `${from} vous a envoyé une demande d'ami.`
  })
  const link = appLink(ctx.siteUrl, lang, '/notifications')
  const settings = appLink(ctx.siteUrl, lang, '/reglages')
  const subject = lang === 'en' ? `You have ${items.length} new notifications` : `Vous avez ${items.length} nouvelles notifications`
  const block: Block = lang === 'en'
    ? { title: subject, lines, link: { label: 'Open my notifications', url: link }, footer: FOOTER.en(settings) }
    : { title: subject, lines, link: { label: 'Ouvrir mes notifications', url: link }, footer: FOOTER.fr(settings) }
  return { subject, ...layout(lang, block) }
}

export interface AiAlertData {
  /** `credit` : le fournisseur a refusé faute de crédit ; `budget` : le plafond du mois est atteint. */
  reason: 'credit' | 'budget'
  /** Nombre d'erreurs de facturation constatées (crédit) ou appels du mois (budget). */
  count?: number
  billingUrl?: string
}

/** Alerte pour Nina (français). Aucun nom d'utilisateur, aucune recette. */
export function renderAiCreditAlert(data: AiAlertData, ctx: TemplateContext): RenderedEmail {
  const credit = data.reason === 'credit'
  const subject = credit ? `${ctx.appName} : crédit IA épuisé, l'import automatique est en pause` : `${ctx.appName} : budget IA du mois atteint, l'import automatique est en pause`
  const lines = credit
    ? [
        'Le fournisseur d\'IA a refusé un appel faute de crédit. L\'import automatique et la traduction sont désactivés pour tout le monde ; la saisie manuelle des recettes continue de fonctionner.',
        'Rechargez le crédit, puis cliquez sur « Réactiver l\'IA » dans l\'écran support (ou attendez le contrôle automatique de la nuit).'
      ]
    : [
        `Le plafond d'utilisation de l'IA pour le mois est atteint${typeof data.count === 'number' ? ` (${data.count} appels)` : ''}. L'import automatique et la traduction sont désactivés pour tout le monde jusqu'au mois prochain, sauf si vous relevez la limite (variable AI_MONTHLY_BUDGET_CALLS ou AI_MONTHLY_BUDGET_USD).`,
        'La saisie manuelle des recettes continue de fonctionner.'
      ]
  if (credit && data.billingUrl) lines.push(`Page de facturation du fournisseur : ${data.billingUrl}`)
  const support = appLink(ctx.siteUrl, 'fr', '/support/signalements')
  const block: Block = {
    title: subject,
    lines,
    link: { label: 'Ouvrir l\'écran support', url: support },
    footer: 'Cet e-mail d\'alerte est envoyé au plus une fois par 24 heures.'
  }
  return { subject, ...layout('fr', block) }
}
