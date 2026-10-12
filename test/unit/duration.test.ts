import { describe, expect, it } from 'vitest'
import { formatClock, formatDuration, parseDuration, parseDurations } from '../../shared/utils/duration'

const secondsOf = (text: string) => parseDuration(text)?.seconds ?? null

describe('parseDuration : unités simples', () => {
  it.each([
    ['Cuire 10 minutes à feu doux.', 600],
    ['Cuire 10 min.', 600],
    ['Cuire 10 mn', 600],
    ['Cuire 10 mns', 600],
    ['Cuire 1 minute', 60],
    ['Laisser reposer 45 secondes', 45],
    ['Mixer 30 sec', 30],
    ['Mixer 20 s', 20],
    ['Cuire 1 heure', 3600],
    ['Cuire 2 hours', 7200],
    ['Bake for 25 minutes', 1500],
    ['Bake 15 mins', 900],
    ['Marinate 3 hrs', 10800],
    ['Rest 90 seconds', 90],
    ['Cuire 2 h', 7200],
    ['CUIRE 10 MINUTES', 600]
  ])('%s → %i s', (text, expected) => {
    expect(secondsOf(text)).toBe(expected)
  })
})

describe('parseDuration : heures et minutes combinées', () => {
  it.each([
    ['Cuire 1 h 30', 5400],
    ['Cuire 1h30', 5400],
    ['Cuire 1 h 30 min', 5400],
    ['Cuire 1 heure 30', 5400],
    ['Cuire 1 heure et 30 minutes', 5400],
    ['Cook 1 hr 15 min', 4500],
    ['Cook 2 hours 10 minutes', 7800],
    ['Cuire 1 h 05', 3900],
    ['Cuire 1 heure et demie', 5400],
    ['Cuire 2 heures et quart', 8100],
    ['Cuire 2 min 30 secondes', 150],
    ['Cook 1 minute and 30 seconds', 90],
    ['Cuire 1,5 heure', 5400],
    ['Cook 1.5 hours', 5400],
    ['Cuire 1½ heure', 5400],
    ['Cuire 1/2 heure', 1800]
  ])('%s → %i s', (text, expected) => {
    expect(secondsOf(text)).toBe(expected)
  })

  it('ne confond pas des minutes sans unité avec une quantité', () => {
    expect(secondsOf('Cuire 1 heure 30 g de beurre')).toBe(3600)
    expect(secondsOf('Cuire 1 heure 2 œufs')).toBe(3600)
    expect(secondsOf('Cuire 1 h 30 cl de lait')).toBe(3600)
    expect(secondsOf('Cuire 1 h 45 °C')).toBe(3600)
  })
})

describe('parseDuration : mots', () => {
  it.each([
    ['Cuire une demi-heure', 1800],
    ['Cuire une demi heure', 1800],
    ['Laisser reposer un quart d’heure', 900],
    ['Laisser reposer un quart d\'heure', 900],
    ['Bake for half an hour', 1800],
    ['Rest a quarter of an hour', 900],
    ['Cuire pendant dix minutes', 600],
    ['Cuire une heure', 3600],
    ['Cuire deux heures', 7200],
    ['Wait one minute', 60],
    ['Wait a minute', 60],
    ['Bake for twenty minutes', 1200]
  ])('%s → %i s', (text, expected) => {
    expect(secondsOf(text)).toBe(expected)
  })

  it('ne lit pas « a second » comme une durée', () => {
    expect(parseDuration('Add a second layer of cream')).toBeNull()
    expect(parseDuration('Une seconde couche de crème')).toBeNull()
  })
})

describe('parseDuration : fourchettes', () => {
  it.each([
    ['Cuire 10 à 12 minutes', 600, 720, '10–12 min'],
    ['Cuire 10-12 min', 600, 720, '10–12 min'],
    ['Cuire 10 – 12 min', 600, 720, '10–12 min'],
    ['Bake 10 to 12 minutes', 600, 720, '10–12 min'],
    ['Cuire 2 ou 3 minutes', 120, 180, '2–3 min'],
    ['Bake 8 or 10 min', 480, 600, '8–10 min'],
    ['Cuire 2 à 3 heures', 7200, 10800, '2–3 h'],
    ['Cuire 1,5 à 2 heures', 5400, 7200, '1 h 30–2 h'],
    ['Laisser 12-10 min', 600, 720, '10–12 min']
  ])('%s', (text, low, high, label) => {
    const duration = parseDuration(text)
    expect(duration?.seconds).toBe(low)
    expect(duration?.maxSeconds).toBe(high)
    expect(duration?.label).toBe(label)
  })

  it('une durée simple n’a pas de borne haute', () => {
    expect(parseDuration('Cuire 12 min')).toMatchObject({ seconds: 720, maxSeconds: null, label: '12 min' })
  })
})

describe('parseDuration : ce qui n’est pas une durée', () => {
  it.each([
    'Préchauffer le four à 180 °C.',
    'Preheat the oven to 350°F.',
    'Ajouter 2 œufs et 250 g de farine.',
    'Add 3 eggs and 2 tbsp of sugar.',
    'Verser 20 cl de lait.',
    'Ajouter 2 hachis',
    'Étape 3 : mélanger.',
    'Mélanger jusqu’à obtention d’une pâte lisse.',
    'Répartir en 12 parts.',
    'Cuire à 200 degrés',
    'Mettre 5 s’il le faut',
    '',
    '   '
  ])('%s → aucune durée', (text) => {
    expect(parseDuration(text)).toBeNull()
  })

  it('tolère null et undefined', () => {
    expect(parseDuration(null)).toBeNull()
    expect(parseDuration(undefined)).toBeNull()
    expect(parseDurations(null)).toEqual([])
  })

  it('ignore une durée nulle ou absurde', () => {
    expect(parseDuration('Cuire 0 minute')).toBeNull()
    expect(parseDuration('Cuire 500 heures')).toBeNull()
  })

  it('ignore la température mais garde la durée qui suit', () => {
    expect(secondsOf('Enfourner à 180 °C pendant 25 minutes.')).toBe(1500)
    expect(secondsOf('Enfourner 25 min à 180 °C.')).toBe(1500)
    expect(secondsOf('Bake at 350°F for 1 hour 15 minutes')).toBe(4500)
  })
})

describe('parseDurations : plusieurs durées', () => {
  it('les renvoie dans l’ordre de lecture', () => {
    const durations = parseDurations('Cuire 10 min puis laisser reposer 5 minutes, enfin 1 h au frais.')
    expect(durations.map(duration => duration.seconds)).toEqual([600, 300, 3600])
  })

  it('retire les doublons', () => {
    expect(parseDurations('Cuire 10 min (soit 10 minutes en tout)')).toHaveLength(1)
  })

  it('la première est celle de parseDuration', () => {
    expect(parseDuration('Cuire 10 min puis 5 min')?.seconds).toBe(600)
  })

  it('un nombre collé à un mot n’est pas une durée (« 10min » l’est)', () => {
    expect(parseDurations('Cuire 10min')).toHaveLength(1)
  })

  it('conserve l’extrait lu', () => {
    expect(parseDuration('Cuire 1 h 30 à feu doux')?.text).toBe('1 h 30')
    expect(parseDuration('Cuire 10 à 12 minutes')?.text).toBe('10 à 12 minutes')
  })
})

describe('formatDuration / formatClock', () => {
  it.each([
    [45, '45 s'],
    [60, '1 min'],
    [90, '1 min 30 s'],
    [720, '12 min'],
    [3600, '1 h'],
    [5400, '1 h 30'],
    [3900, '1 h 05']
  ])('formatDuration(%i) = %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected)
  })

  it.each([
    [0, '00:00'],
    [9, '00:09'],
    [522, '08:42'],
    [3600, '1:00:00'],
    [3725, '1:02:05'],
    [0.2, '00:01'],
    [-5, '00:00']
  ])('formatClock(%d) = %s', (seconds, expected) => {
    expect(formatClock(seconds)).toBe(expected)
  })
})
