import { describe, expect, it } from 'vitest'
import { profileErrorKey, validateDisplayName } from '../../shared/utils/profileErrors'
import { isV2Enabled } from '../../shared/utils/v2'

describe('interrupteur v2', () => {
  it('actif seulement pour true / "true" / "1"', () => {
    expect(isV2Enabled(true)).toBe(true)
    expect(isV2Enabled('true')).toBe(true)
    expect(isV2Enabled(' TRUE ')).toBe(true)
    expect(isV2Enabled('1')).toBe(true)
    for (const off of [false, undefined, null, '', 'false', '0', 'yes', 1, {}]) expect(isV2Enabled(off), String(off)).toBe(false)
  })
})

describe('erreurs du pseudonyme', () => {
  const pg = (message: string, code = '22023') => ({ code, message })
  it('reconnaît les refus de la base (0023)', () => {
    expect(profileErrorKey(pg('Ce pseudonyme est déjà pris'))).toBe('taken')
    expect(profileErrorKey(pg('Le pseudonyme ne peut pas contenir « @ » (jamais d\'adresse e-mail affichée)'))).toBe('noAt')
    expect(profileErrorKey(pg('Le pseudonyme contient un caractère interdit'))).toBe('forbiddenChar')
    expect(profileErrorKey(pg('Le pseudonyme contient un caractère invisible, de mise en forme ou une espace spéciale'))).toBe('invisibleChar')
    expect(profileErrorKey(pg('Le pseudonyme ne peut pas mélanger l\'alphabet latin avec le cyrillique ou le grec'))).toBe('mixedScripts')
    expect(profileErrorKey(pg('Le pseudonyme doit faire de 1 à 60 caractères'))).toBe('length')
    expect(profileErrorKey(pg('Le titre du carnet doit faire 80 caractères au plus'))).toBe('titleLength')
    expect(profileErrorKey(pg('x', '54000'))).toBe('rate')
    expect(profileErrorKey(pg('x', '42501'))).toBe('notMember')
  })
  it('repli générique pour tout le reste', () => {
    for (const e of [null, undefined, 'x', new Error('boum'), pg('autre chose'), { code: '500' }]) expect(profileErrorKey(e)).toBe('generic')
  })
  it('contrôle immédiat avant l\'appel', () => {
    expect(validateDisplayName('  ')).toBe('required')
    expect(validateDisplayName('a@b.fr')).toBe('noAt')
    expect(validateDisplayName('x'.repeat(61))).toBe('length')
    expect(validateDisplayName(' Nina ')).toBeNull()
  })
})
