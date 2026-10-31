import { describe, expect, it } from 'vitest'
import { isPresetAvailable, presetOf } from '../../shared/themes'
import { profileErrorKey } from '../../shared/utils/profileErrors'
import { socialErrorMessage } from '../../shared/utils/socialUi'

/** Préréglage « Boultons » réservé (migration 0034) : qui peut le choisir dans le sélecteur. */
const BOULTONS = { preset: 'boultons', primary: '#2f7d7a' }
const OLIVE = { preset: 'olive' }

describe('isPresetAvailable', () => {
  it('les préréglages ordinaires sont toujours disponibles', () => {
    for (const mode of ['personal', 'group'] as const) {
      expect(isPresetAvailable('olive', { mode, memberGroupThemes: [] })).toBe(true)
      expect(isPresetAvailable('terracotta', { mode, memberGroupThemes: [] })).toBe(true)
    }
  })
  it('personnel : réservé aux membres d\'un groupe au thème Boultons', () => {
    expect(isPresetAvailable('boultons', { mode: 'personal', memberGroupThemes: [] })).toBe(false)
    expect(isPresetAvailable('boultons', { mode: 'personal', memberGroupThemes: [OLIVE, null, 'x'] })).toBe(false)
    expect(isPresetAvailable('boultons', { mode: 'personal', memberGroupThemes: [OLIVE, BOULTONS] })).toBe(true)
  })
  it('personnel : une personne qui l\'a déjà le garde', () => {
    expect(isPresetAvailable('boultons', { mode: 'personal', memberGroupThemes: [], currentPreset: 'boultons' })).toBe(true)
    expect(isPresetAvailable('boultons', { mode: 'personal', memberGroupThemes: [], currentPreset: 'olive' })).toBe(false)
  })
  it('groupe : seulement s\'il l\'a déjà, même pour un créateur membre des Boultons', () => {
    expect(isPresetAvailable('boultons', { mode: 'group', memberGroupThemes: [BOULTONS], currentPreset: 'olive' })).toBe(false)
    expect(isPresetAvailable('boultons', { mode: 'group', memberGroupThemes: [BOULTONS], currentPreset: null })).toBe(false)
    expect(isPresetAvailable('boultons', { mode: 'group', memberGroupThemes: [BOULTONS], currentPreset: 'boultons' })).toBe(true)
  })
})

describe('presetOf et messages d\'erreur', () => {
  it('presetOf', () => {
    expect(presetOf(BOULTONS)).toBe('boultons')
    expect(presetOf(null)).toBeNull()
    expect(presetOf({ preset: 3 })).toBeNull()
  })
  it('le refus de la base (42501 « Thème réservé aux Boultons ») a son propre message', () => {
    const error = { code: '42501', message: 'Thème réservé aux Boultons' }
    expect(profileErrorKey(error)).toBe('boultonsReserved')
    expect(socialErrorMessage(error).key).toBe('profile.errors.boultonsReserved')
    expect(profileErrorKey({ code: '42501', message: 'autre' })).toBe('notMember')
    expect(socialErrorMessage({ code: '42501', message: 'autre' }).key).toBe('errors.social.forbidden')
  })
})
