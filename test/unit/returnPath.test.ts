import { describe, expect, it } from 'vitest'
import { loginRedirectUrl, safeReturnPath } from '../../shared/utils/returnPath'

describe('safeReturnPath', () => {
  it('accepte un chemin du site (avec langue, requête)', () => {
    expect(safeReturnPath('/favoris')).toBe('/favoris')
    expect(safeReturnPath('/en/planning?week=2026-10-26')).toBe('/en/planning?week=2026-10-26')
    expect(safeReturnPath(['/courses', '/x'])).toBe('/courses')
  })
  it('refuse adresses externes, protocole relatif, antislash, vide, non texte', () => {
    for (const bad of ['https://exemple.test', '//exemple.test', '/\\exemple.test', 'favoris', '', null, undefined, 42, '/a\nb']) {
      expect(safeReturnPath(bad), String(bad)).toBeNull()
    }
  })
  it('loginRedirectUrl encode la cible et se relit', () => {
    const url = loginRedirectUrl('/en', '/en/planning?week=1')
    expect(url).toBe('/en?connexion=%2Fen%2Fplanning%3Fweek%3D1')
    expect(safeReturnPath(new URL(url, 'http://x').searchParams.get('connexion'))).toBe('/en/planning?week=1')
  })
})
