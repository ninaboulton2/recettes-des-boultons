import { describe, expect, it } from 'vitest'
import { normalizeAccents } from '#shared/utils/text'

describe('normalizeAccents', () => {
  it('supprime les accents et passe en minuscules', () => {
    expect(normalizeAccents('Crème Brûlée')).toBe('creme brulee')
    expect(normalizeAccents('Gâteau à l\'Éclair')).toBe('gateau a l\'eclair')
  })

  it('laisse intacts les caractères non accentués', () => {
    expect(normalizeAccents('tarte 123')).toBe('tarte 123')
  })

  it('renvoie une chaîne vide pour les valeurs vides', () => {
    expect(normalizeAccents('')).toBe('')
    expect(normalizeAccents(null)).toBe('')
    expect(normalizeAccents(undefined)).toBe('')
  })

  it('permet une recherche insensible aux accents', () => {
    const titres = ['Pâtes au pistou', 'Pêches rôties', 'Soupe de pois']
    const requete = normalizeAccents('PATES')
    expect(titres.filter(t => normalizeAccents(t).includes(requete))).toEqual(['Pâtes au pistou'])
  })
})
