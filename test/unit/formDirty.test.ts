import { describe, expect, it } from 'vitest'
import { formSnapshot, isFormDirty } from '../../app/utils/formDirty'

const base = () => ({
  title: 'Gâteau',
  prepTime: null as number | null,
  tags: ['dessert'],
  sections: [
    { key: 'a1', name: '', type: 'ingredients', ingredients: [{ key: 'i1', name: 'Sucre', amount: '100', unit: 'g', optional: false }], instructions: [] },
    { key: 'a2', name: '', type: 'instructions', ingredients: [], instructions: [{ key: 's1', content: 'Mélanger' }] }
  ]
})

describe('isFormDirty', () => {
  it('est propre sur un état identique, même avec des clés régénérées', () => {
    const snapshot = formSnapshot(base())
    const other = base()
    other.sections[0]!.key = 'zzz'
    other.sections[0]!.ingredients[0]!.key = 'yyy'
    expect(isFormDirty(other, snapshot)).toBe(false)
  })

  it('ignore espaces de bord et null/undefined/vide', () => {
    const snapshot = formSnapshot({ ...base(), description: '' })
    expect(isFormDirty({ ...base(), title: ' Gâteau ', description: undefined }, snapshot)).toBe(false)
  })

  it('détecte une modification du titre, des tags, d\'un nombre', () => {
    const snapshot = formSnapshot(base())
    expect(isFormDirty({ ...base(), title: 'Autre' }, snapshot)).toBe(true)
    expect(isFormDirty({ ...base(), tags: [] }, snapshot)).toBe(true)
    expect(isFormDirty({ ...base(), prepTime: 5 }, snapshot)).toBe(true)
  })

  it('détecte une modification dans les sections, ingrédients et étapes', () => {
    const snapshot = formSnapshot(base())
    const ingredient = base()
    ingredient.sections[0]!.ingredients[0]!.amount = '200'
    expect(isFormDirty(ingredient, snapshot)).toBe(true)
    const step = base()
    step.sections[1]!.instructions[0]!.content = 'Fouetter'
    expect(isFormDirty(step, snapshot)).toBe(true)
    const added = base()
    added.sections.push({ key: 'a3', name: '', type: 'ingredients', ingredients: [], instructions: [] })
    expect(isFormDirty(added, snapshot)).toBe(true)
    const reordered = base()
    reordered.sections.reverse()
    expect(isFormDirty(reordered, snapshot)).toBe(true)
  })

  it('un changement de photo suffit', () => {
    expect(isFormDirty(base(), formSnapshot(base()), true)).toBe(true)
  })
})
