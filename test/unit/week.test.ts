import { describe, expect, it } from 'vitest'
import {
  daysBetween,
  fromDateString,
  isSameDay,
  shiftWeeks,
  startOfWeek,
  toDateString,
  weekBounds,
  weekDates
} from '../../app/utils/week'

describe('toDateString / fromDateString', () => {
  it('utilise la date locale, y compris juste après minuit', () => {
    // 00:30 locale : `toISOString()` donnerait la veille dans les fuseaux à l'est de Greenwich.
    expect(toDateString(new Date(2026, 9, 3, 0, 30))).toBe('2026-10-03')
    expect(toDateString(new Date(2026, 0, 1, 23, 59))).toBe('2026-01-01')
  })

  it('aller-retour avec fromDateString et rejet des clés invalides', () => {
    const date = fromDateString('2026-10-03')
    expect(date).not.toBeNull()
    expect(toDateString(date as Date)).toBe('2026-10-03')
    expect(fromDateString('2026-02-30')).toBeNull()
    expect(fromDateString('03/10/2026')).toBeNull()
  })
})

describe('startOfWeek / weekDates / weekBounds', () => {
  it('commence le lundi, le dimanche appartenant à la semaine qui s\'achève', () => {
    expect(toDateString(startOfWeek(new Date(2026, 9, 3)))).toBe('2026-09-28') // samedi
    expect(toDateString(startOfWeek(new Date(2026, 9, 4)))).toBe('2026-09-28') // dimanche
    expect(toDateString(startOfWeek(new Date(2026, 9, 5)))).toBe('2026-10-05') // lundi
  })

  it('renvoie 7 jours consécutifs du lundi au dimanche', () => {
    const days = weekDates(new Date(2026, 9, 3)).map(toDateString)
    expect(days).toEqual([
      '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'
    ])
    expect(weekBounds(new Date(2026, 9, 3))).toEqual({ from: '2026-09-28', to: '2026-10-04' })
  })

  it('traverse les changements d\'heure sans sauter de jour', () => {
    // Semaine du passage à l'heure d'hiver en Europe (dernier dimanche d'octobre 2026 : le 25).
    const days = weekDates(new Date(2026, 9, 21)).map(toDateString)
    expect(days).toEqual([
      '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'
    ])
  })
})

describe('shiftWeeks / isSameDay / daysBetween', () => {
  it('décale de semaines entières', () => {
    expect(toDateString(shiftWeeks(new Date(2026, 9, 3), 1))).toBe('2026-10-10')
    expect(toDateString(shiftWeeks(new Date(2026, 9, 3), -2))).toBe('2026-09-19')
  })

  it('compare des jours calendaires', () => {
    expect(isSameDay(new Date(2026, 9, 3, 1), new Date(2026, 9, 3, 23))).toBe(true)
    expect(isSameDay(new Date(2026, 9, 3), new Date(2026, 9, 4))).toBe(false)
  })

  it('compte les jours entre deux clés', () => {
    expect(daysBetween('2026-09-28', '2026-10-04')).toBe(6)
    expect(daysBetween('2026-10-04', '2026-09-28')).toBe(-6)
    expect(daysBetween('n/a', '2026-09-28')).toBe(0)
  })
})
