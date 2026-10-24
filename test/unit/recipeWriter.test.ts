import { describe, expect, it } from 'vitest'
import { recipeWriterRequirement } from '../../shared/utils/v2'

/** Écriture et IA des recettes : admins en v1 (rien ne change sans l'interrupteur), tout compte connecté en v2. */
describe('recipeWriterRequirement', () => {
  it('v1 : admin, quelle que soit la valeur « éteinte » de l’interrupteur', () => {
    for (const off of [undefined, null, false, '', 'false', '0', 'non', 0]) expect(recipeWriterRequirement(off), String(off)).toBe('admin')
  })
  it('v2 : tout compte connecté', () => {
    for (const on of [true, 'true', ' TRUE ', '1']) expect(recipeWriterRequirement(on), String(on)).toBe('user')
  })
})
