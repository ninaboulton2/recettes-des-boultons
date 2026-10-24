import { afterEach, describe, expect, it, vi } from 'vitest'
import { isEmailConfigured, readEmailConfig, RESEND_ENDPOINT, sendAiCreditAlert, sendEmail, type EmailConfig, type FetchLike } from '../../server/utils/email'
import { appLink, cleanName, renderAiCreditAlert, renderFriendRequest, renderGroupInvitation, renderNotificationDigest } from '../../server/utils/emailTemplates'
import { sendNotificationEmails, type ClaimedNotification } from '../../server/utils/notificationEmails'

const CONFIG: EmailConfig = { apiKey: 're_test_123', from: 'Recettes <no-reply@example.test>', alertEmail: 'nina@example.test', siteUrl: 'https://recettes.example.test', appName: 'Recettes' }
const CTX = { siteUrl: CONFIG.siteUrl, appName: CONFIG.appName }
const MESSAGE = { to: 'eve@example.test', subject: 'Sujet', html: '<p>x</p>', text: 'x' }

afterEach(() => { vi.restoreAllMocks() })

function resendMock(response: { ok: boolean, status: number, body?: unknown } = { ok: true, status: 200, body: { id: 'em_1' } }) {
  const calls: Array<{ url: string, init: Parameters<FetchLike>[1] }> = []
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init })
    return { ok: response.ok, status: response.status, json: async () => response.body ?? {} }
  }
  return { fetchImpl, calls }
}

describe('configuration des e-mails (variables d\'environnement)', () => {
  it('lit runtimeConfig, puis la variable historique', () => {
    expect(readEmailConfig({ resendApiKey: 'k1', emailFrom: 'f1', alertEmail: 'a1', siteUrl: 'https://s1' }, { RESEND_API_KEY: 'k2' })).toMatchObject({ apiKey: 'k1', from: 'f1', alertEmail: 'a1', siteUrl: 'https://s1' })
    expect(readEmailConfig({}, { RESEND_API_KEY: 'k2', EMAIL_FROM: 'f2', ALERT_EMAIL: 'a2', SITE_URL: 'https://s2' }, 'https://origine')).toMatchObject({ apiKey: 'k2', from: 'f2', alertEmail: 'a2', siteUrl: 'https://s2' })
    expect(readEmailConfig({}, {}, 'https://origine')).toMatchObject({ apiKey: '', from: '', alertEmail: '', siteUrl: 'https://origine', appName: 'Recettes' })
  })

  it('« configuré » demande la clé ET l\'expéditeur', () => {
    expect(isEmailConfigured(CONFIG)).toBe(true)
    expect(isEmailConfigured({ ...CONFIG, apiKey: '' })).toBe(false)
    expect(isEmailConfigured({ ...CONFIG, from: '' })).toBe(false)
  })
})

describe('envoi par Resend (simulé)', () => {
  it('appelle l\'API Resend avec la clé, l\'expéditeur et le destinataire', async () => {
    const { fetchImpl, calls } = resendMock()
    const result = await sendEmail(CONFIG, MESSAGE, fetchImpl)
    expect(result).toEqual({ status: 'sent', id: 'em_1' })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe(RESEND_ENDPOINT)
    expect(calls[0]!.init.headers.Authorization).toBe('Bearer re_test_123')
    expect(JSON.parse(calls[0]!.init.body)).toEqual({ from: CONFIG.from, to: ['eve@example.test'], subject: 'Sujet', html: '<p>x</p>', text: 'x' })
  })

  it('SANS clé : aucun appel réseau, un journal, aucune erreur', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { fetchImpl, calls } = resendMock()
    const result = await sendEmail({ ...CONFIG, apiKey: '' }, MESSAGE, fetchImpl)
    expect(result).toEqual({ status: 'skipped', reason: 'not_configured' })
    expect(calls).toHaveLength(0)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]![0])).not.toContain('eve@example.test')   // pas d'adresse dans le journal
  })

  it('sans expéditeur : pas d\'envoi non plus', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { fetchImpl, calls } = resendMock()
    expect((await sendEmail({ ...CONFIG, from: '' }, MESSAGE, fetchImpl)).status).toBe('skipped')
    expect(calls).toHaveLength(0)
  })

  it('destinataire invalide : ignoré', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { fetchImpl, calls } = resendMock()
    expect(await sendEmail(CONFIG, { ...MESSAGE, to: 'pas une adresse' }, fetchImpl)).toEqual({ status: 'skipped', reason: 'invalid_recipient' })
    expect(calls).toHaveLength(0)
  })

  it('refus de Resend ou réseau en panne : `failed`, jamais d\'exception', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(await sendEmail(CONFIG, MESSAGE, resendMock({ ok: false, status: 403 }).fetchImpl)).toEqual({ status: 'failed', reason: 'http_403' })
    const boom: FetchLike = async () => { throw new TypeError('fetch failed') }
    expect(await sendEmail(CONFIG, MESSAGE, boom)).toEqual({ status: 'failed', reason: 'network' })
    expect(error).toHaveBeenCalled()
    expect(JSON.stringify(error.mock.calls)).not.toContain('re_test_123')   // la clé ne sort jamais dans les journaux
  })
})

describe('alerte de crédit pour Nina', () => {
  it('part vers ALERT_EMAIL (jamais une adresse en dur), en français, sans donnée d\'utilisateur', async () => {
    const { fetchImpl, calls } = resendMock()
    const result = await sendAiCreditAlert(CONFIG, { reason: 'credit' }, fetchImpl)
    expect(result.status).toBe('sent')
    const body = JSON.parse(calls[0]!.init.body)
    expect(body.to).toEqual(['nina@example.test'])
    expect(body.subject).toMatch(/crédit IA épuisé/)
    expect(body.text).toMatch(/Réactiver l'IA/)
    expect(body.text).toContain('https://recettes.example.test/support/signalements')
  })

  it('sans ALERT_EMAIL ou sans Resend : journalisée et ignorée', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { fetchImpl, calls } = resendMock()
    expect((await sendAiCreditAlert({ ...CONFIG, alertEmail: '' }, { reason: 'credit' }, fetchImpl)).status).toBe('skipped')
    expect((await sendAiCreditAlert({ ...CONFIG, apiKey: '' }, { reason: 'budget' }, fetchImpl)).status).toBe('skipped')
    expect(calls).toHaveLength(0)
  })

  it('l\'alerte de budget dit autre chose que celle du crédit', () => {
    const credit = renderAiCreditAlert({ reason: 'credit' }, CTX)
    const budget = renderAiCreditAlert({ reason: 'budget', count: 500 }, CTX)
    expect(budget.subject).toMatch(/budget IA du mois/)
    expect(budget.text).toContain('500 appels')
    expect(credit.subject).not.toBe(budget.subject)
  })
})

describe('gabarits FR / EN', () => {
  it('invitation à un groupe', () => {
    const fr = renderGroupInvitation('fr', { fromName: 'Dave', groupName: 'Les Huit' }, CTX)
    expect(fr.subject).toBe('Dave vous invite à rejoindre le groupe « Les Huit »')
    expect(fr.html).toContain('lang="fr"')
    expect(fr.text).toContain('https://recettes.example.test/notifications')
    const en = renderGroupInvitation('en', { fromName: 'Dave', groupName: 'The Eights' }, CTX)
    expect(en.subject).toBe('Dave invites you to join the group “The Eights”')
    expect(en.text).toContain('https://recettes.example.test/en/notifications')
    expect(en.text).toContain('https://recettes.example.test/en/reglages')
  })

  it('demande d\'ami', () => {
    expect(renderFriendRequest('fr', { fromName: 'Dave' }, CTX).subject).toBe('Dave vous a envoyé une demande d\'ami')
    expect(renderFriendRequest('en', { fromName: 'Dave' }, CTX).subject).toBe('Dave sent you a friend request')
    expect(renderFriendRequest('fr', {}, CTX).subject).toContain('Quelqu\'un')
  })

  it('échappe le HTML et borne les noms venant de la base', () => {
    const mail = renderGroupInvitation('fr', { fromName: '<script>alert(1)</script>', groupName: 'A\n"B"' }, CTX)
    expect(mail.html).not.toContain('<script>')
    expect(mail.html).toContain('&lt;script&gt;')
    expect(mail.subject).not.toContain('\n')
    expect(cleanName('x'.repeat(200), 'repli')).toHaveLength(60)
    expect(cleanName('   ', 'repli')).toBe('repli')
    expect(cleanName(42, 'repli')).toBe('repli')
  })

  it('aucune adresse e-mail dans les messages', () => {
    for (const mail of [
      renderGroupInvitation('fr', { fromName: 'Dave', groupName: 'G' }, CTX),
      renderFriendRequest('en', { fromName: 'Dave' }, CTX),
      renderNotificationDigest('fr', [{ type: 'friend_request', payload: { from_name: 'A' } }, { type: 'group_invitation', payload: { from_name: 'B', group_name: 'C' } }], CTX)!
    ]) {
      expect(mail.html + mail.text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/)
    }
  })

  it('liens : /en/ pour l\'anglais', () => {
    expect(appLink('https://s.test/', 'fr', '/amis')).toBe('https://s.test/amis')
    expect(appLink('https://s.test', 'en', '/amis')).toBe('https://s.test/en/amis')
  })

  it('synthèse : un seul message, la liste quand il y en a plusieurs', () => {
    const many = renderNotificationDigest('fr', [{ type: 'friend_request', payload: { from_name: 'A' } }, { type: 'group_invitation', payload: { from_name: 'B', group_name: 'C' } }], CTX)!
    expect(many.subject).toBe('Vous avez 2 nouvelles notifications')
    expect(many.text).toContain('A vous a envoyé une demande d\'ami.')
    expect(many.text).toContain('B vous invite à rejoindre le groupe « C ».')
    expect(renderNotificationDigest('fr', [], CTX)).toBeNull()
    expect(renderNotificationDigest('fr', [{ type: 'recipe_shared', payload: {} }], CTX)).toBeNull()
  })
})

describe('envoi groupé des notifications (cron)', () => {
  const row = (id: string, userId: string, type: string, payload: Record<string, unknown>, language = 'fr', email = `${userId}@example.test`): ClaimedNotification =>
    ({ id, user_id: userId, type, payload, language, email })

  it('sans Resend configuré : ne réclame rien, n\'envoie rien, ne plante pas', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const claim = vi.fn(async () => [])
    const report = await sendNotificationEmails({ configured: false, context: CTX, claim, release: async () => undefined, send: async () => ({ status: 'sent', id: null }) })
    expect(report).toMatchObject({ skipped: 'not_configured', claimed: 0, sent: 0 })
    expect(claim).not.toHaveBeenCalled()
  })

  it('un e-mail par personne, dans sa langue, à l\'adresse de son compte', async () => {
    const sent: Array<{ to: string, subject: string }> = []
    const report = await sendNotificationEmails({
      configured: true,
      context: CTX,
      claim: async () => [
        row('1', 'eve', 'friend_request', { from_name: 'Dave' }, 'en'),
        row('2', 'eve', 'group_invitation', { from_name: 'Dave', group_name: 'G' }, 'en'),
        row('3', 'bob', 'friend_request', { from_name: 'Dave' }, 'fr')
      ],
      release: async () => undefined,
      send: async (to, rendered) => { sent.push({ to, subject: rendered.subject }); return { status: 'sent', id: 'x' } }
    })
    expect(report).toMatchObject({ claimed: 3, sent: 2, failed: 0, released: 0 })
    expect(sent).toEqual([
      { to: 'eve@example.test', subject: 'You have 2 new notifications' },
      { to: 'bob@example.test', subject: 'Dave vous a envoyé une demande d\'ami' }
    ])
  })

  it('un envoi refusé remet les notifications en attente (réessai au prochain passage)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const release = vi.fn(async () => undefined)
    const report = await sendNotificationEmails({
      configured: true,
      context: CTX,
      claim: async () => [row('1', 'eve', 'friend_request', { from_name: 'D' }), row('2', 'bob', 'friend_request', { from_name: 'D' })],
      release,
      send: async to => (to.startsWith('eve') ? { status: 'failed', reason: 'http_500' } : { status: 'sent', id: 'x' })
    })
    expect(report).toMatchObject({ sent: 1, failed: 1, released: 1 })
    expect(release).toHaveBeenCalledWith(['1'])
  })
})
