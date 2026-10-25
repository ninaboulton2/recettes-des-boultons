import { describe, expect, it } from 'vitest'
import { LEGACY_HOST } from '../../shared/brand'
import { canonicalRedirectTarget, hostnameOf, normalizeSiteUrl, publicOrigin } from '../../shared/utils/siteUrl'

const SITE = 'https://familycookbook.fr'
const base = { siteUrl: SITE, host: LEGACY_HOST, method: 'GET', path: '/recettes/abc?x=1' }

describe('normalizeSiteUrl', () => {
  it('garde l\'origine seule', () => {
    expect(normalizeSiteUrl('https://familycookbook.fr')).toBe(SITE)
    expect(normalizeSiteUrl(' https://familycookbook.fr/ ')).toBe(SITE)
    expect(normalizeSiteUrl('https://familycookbook.fr/chemin?x=1')).toBe(SITE)
    expect(normalizeSiteUrl('http://localhost:3001')).toBe('http://localhost:3001')
  })
  it('refuse le vide, le mal formé et les autres schémas', () => {
    for (const bad of [undefined, null, '', '  ', 'familycookbook.fr', 'ftp://x.fr', 'javascript:alert(1)', 42]) expect(normalizeSiteUrl(bad), String(bad)).toBeNull()
  })
})

describe('hostnameOf', () => {
  it('minuscules, sans port ni point final, premier hôte d\'une liste', () => {
    expect(hostnameOf('Recettes-Des-Boultons.vercel.app:443')).toBe(LEGACY_HOST)
    expect(hostnameOf('recettes-des-boultons.vercel.app.')).toBe(LEGACY_HOST)
    expect(hostnameOf('a.fr, b.fr')).toBe('a.fr')
    expect(hostnameOf('[::1]:3001')).toBe('[::1]')
    expect(hostnameOf(undefined)).toBe('')
  })
})

describe('canonicalRedirectTarget', () => {
  it('ancien alias de production : même chemin et même requête sur SITE_URL', () => {
    expect(canonicalRedirectTarget(base)).toBe('https://familycookbook.fr/recettes/abc?x=1')
    expect(canonicalRedirectTarget({ ...base, path: '/' })).toBe('https://familycookbook.fr/')
    expect(canonicalRedirectTarget({ ...base, path: '/en/r/jeton' })).toBe('https://familycookbook.fr/en/r/jeton')
    expect(canonicalRedirectTarget({ ...base, method: 'HEAD' })).not.toBeNull()
    expect(canonicalRedirectTarget({ ...base, host: 'Recettes-des-Boultons.vercel.app:443' })).not.toBeNull()
  })
  it('SITE_URL vide, absent ou invalide : aucune redirection', () => {
    for (const siteUrl of [undefined, '', 'pas une url']) expect(canonicalRedirectTarget({ ...base, siteUrl })).toBeNull()
  })
  it('prévisualisations, localhost, nouveau domaine et autres hôtes : jamais redirigés', () => {
    for (const host of ['recettes-des-boultons-git-feat-x-nina.vercel.app', 'recettes-des-boultons-abc123.vercel.app', 'autre.vercel.app', 'localhost:3001', '127.0.0.1', 'familycookbook.fr', 'www.familycookbook.fr', '', undefined]) {
      expect(canonicalRedirectTarget({ ...base, host }), String(host)).toBeNull()
    }
  })
  it('un hôte qui contient l\'alias sans l\'être n\'est pas redirigé', () => {
    expect(canonicalRedirectTarget({ ...base, host: `x.${LEGACY_HOST}` })).toBeNull()
    expect(canonicalRedirectTarget({ ...base, host: `${LEGACY_HOST}.evil.test` })).toBeNull()
  })
  it('seulement GET et HEAD (POST, PUT… passent), et jamais les tâches planifiées', () => {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) expect(canonicalRedirectTarget({ ...base, method }), method).toBeNull()
    expect(canonicalRedirectTarget({ ...base, path: '/api/cron/ai-alerts' })).toBeNull()
    expect(canonicalRedirectTarget({ ...base, path: '/api/cron' })).toBeNull()
    expect(canonicalRedirectTarget({ ...base, path: '/api/cronos' })).not.toBeNull()
  })
  it('pas de boucle si SITE_URL est lui-même l\'ancien alias', () => {
    expect(canonicalRedirectTarget({ ...base, siteUrl: `https://${LEGACY_HOST}` })).toBeNull()
  })
  it('un chemin commençant par // reste un chemin sur notre origine (pas de redirection ouverte)', () => {
    expect(canonicalRedirectTarget({ ...base, path: '//evil.test/x' })).toBe('https://familycookbook.fr//evil.test/x')
    expect(canonicalRedirectTarget({ ...base, path: 'evil.test' })).toBeNull()
  })
})

describe('publicOrigin', () => {
  it('SITE_URL sur le site de production et sur l\'ancien alias', () => {
    expect(publicOrigin(SITE, 'https://familycookbook.fr')).toBe(SITE)
    expect(publicOrigin(SITE, `https://${LEGACY_HOST}`)).toBe(SITE)
  })
  it('origine courante pour localhost, prévisualisation ou SITE_URL absent', () => {
    expect(publicOrigin(SITE, 'http://localhost:3001')).toBe('http://localhost:3001')
    expect(publicOrigin(SITE, 'https://recettes-des-boultons-git-x.vercel.app')).toBe('https://recettes-des-boultons-git-x.vercel.app')
    expect(publicOrigin('', 'http://localhost:3001')).toBe('http://localhost:3001')
    expect(publicOrigin(undefined, 'not a url')).toBe('not a url')
  })
})
