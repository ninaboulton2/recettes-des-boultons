import { describe, expect, it } from 'vitest'
import type { Recipe, RecipeInput } from '#shared/types'
import {
  amountHasWords,
  contentMatchesTexts,
  detectLanguage,
  flattenTexts,
  inputTexts,
  localizeRecipe,
  localizeSummary,
  normalizeDraft,
  otherLang,
  recipeTexts,
  sourceHash,
  sourceLanguageProblem,
  strongLanguage,
  translatedInput,
  translationShapeProblem,
  type TranslationDraft
} from '#shared/utils/translation'
import { toRecipe, toRecipeSummary, toSummaryTranslation, type RecipeWithSectionsRow } from '#shared/utils/recipes'

const detail = {
  title: ' Tarte aux pommes ',
  description: 'Une tarte simple.',
  notes: null,
  tags: ['végétarien', ' '],
  sections: [
    // volontairement dans le désordre : l'ordre vient de `orderIndex`
    { name: 'Préparation', orderIndex: 1, ingredients: [], instructions: [{ content: 'Cuire.', orderIndex: 1 }, { content: 'Mélanger.', orderIndex: 0 }] },
    {
      name: 'Pâte',
      orderIndex: 0,
      ingredients: [
        { name: 'sel', amount: 'au goût', unit: null, unitCode: null, orderIndex: 1 },
        { name: 'farine', amount: '250', unit: 'g', unitCode: 'g', orderIndex: 0 },
        { name: 'stick de beurre', amount: '1', unit: 'stick', unitCode: null, orderIndex: 2 }
      ],
      instructions: []
    }
  ]
}

describe('langues', () => {
  it('otherLang et amountHasWords', () => {
    expect(otherLang('fr')).toBe('en')
    expect(otherLang('en')).toBe('fr')
    expect(amountHasWords('au goût')).toBe(true)
    expect(amountHasWords('2 à 3')).toBe(true)
    expect(amountHasWords('1/2')).toBe(false)
    expect(amountHasWords('1,5')).toBe(false)
    expect(amountHasWords(null)).toBe(false)
  })

  it('detectLanguage devine fr / en, français par défaut', () => {
    expect(detectLanguage('Mélanger la farine avec le sucre et les œufs, puis cuire au four.')).toBe('fr')
    expect(detectLanguage('Mix the flour with the butter and bake until golden.')).toBe('en')
    expect(detectLanguage('')).toBe('fr')
    expect(detectLanguage('12345')).toBe('fr')
  })
})

describe('garde-fou de la langue source (détection du modèle)', () => {
  const french = recipeTexts({
    title: 'Blinis', description: 'Petites crêpes légères et moelleuses.', notes: null, tags: [],
    sections: [{ name: 'Recette', orderIndex: 0, ingredients: [{ name: 'farine de blé', amount: null, unit: null, unitCode: null, orderIndex: 0 }],
      instructions: [
        { content: 'Séparer les jaunes et les blancs des œufs.', orderIndex: 0 },
        { content: 'Verser la farine dans un saladier, puis ajouter le sel et le poivre.', orderIndex: 1 },
        { content: 'Faire cuire les cuillerées dans une poêle huilée avec du beurre.', orderIndex: 2 },
        { content: 'Laisser reposer la pâte avec le lait pendant une heure dans le four.', orderIndex: 3 }
      ] }]
  })

  it('strongLanguage ne tranche que sur un texte long et sans ambiguïté', () => {
    expect(strongLanguage(flattenTexts(french))).toBe('fr')
    expect(strongLanguage('Mix the flour with the butter and the sugar, then add the eggs and stir until smooth. Bake in the oven for an hour.')).toBe('en')
    expect(strongLanguage('Tarte aux pommes')).toBeNull()
    expect(strongLanguage('')).toBeNull()
    expect(strongLanguage('Mix the flour avec le sucre')).toBeNull()
  })

  it('sourceLanguageProblem refuse une recette française déclarée anglaise (et inversement), pas un texte ambigu', () => {
    expect(sourceLanguageProblem(french, 'fr')).toBeNull()
    expect(sourceLanguageProblem(french, 'en')).toMatch(/« en ».*« fr »/)
    const english = recipeTexts({ ...detail, title: 'Pie', description: null, tags: [], sections: [{ name: 'Method', orderIndex: 0, ingredients: [],
      instructions: [{ content: 'Preheat the oven, then mix the flour with the butter and the sugar until smooth.', orderIndex: 0 },
        { content: 'Add the eggs and stir, then bake for about an hour and serve with cream.', orderIndex: 1 }] }] })
    expect(sourceLanguageProblem(english, 'fr')).toMatch(/« fr ».*« en »/)
    expect(sourceLanguageProblem(english, 'en')).toBeNull()
    // texte court (titre seul) : on fait confiance au modèle
    expect(sourceLanguageProblem(recipeTexts({ ...detail, title: 'Gaspacho', description: null, tags: [], sections: [] }), 'en')).toBeNull()
  })
})

describe('recipeTexts', () => {
  const texts = recipeTexts(detail)

  it('trie par orderIndex, nettoie les espaces et les tags vides', () => {
    expect(texts.title).toBe('Tarte aux pommes')
    expect(texts.tags).toEqual(['végétarien'])
    expect(texts.sections.map(section => section.name)).toEqual(['Pâte', 'Préparation'])
    expect(texts.sections[0]!.ingredients.map(ingredient => ingredient.name)).toEqual(['farine', 'sel', 'stick de beurre'])
    expect(texts.sections[1]!.instructions).toEqual(['Mélanger.', 'Cuire.'])
  })

  it('ne garde que les quantités avec des mots et les unités libres', () => {
    expect(texts.sections[0]!.ingredients).toEqual([
      { name: 'farine', amount: null, unit: null },
      { name: 'sel', amount: 'au goût', unit: null },
      { name: 'stick de beurre', amount: null, unit: 'stick' }
    ])
  })

  it('flattenTexts rassemble tous les textes', () => {
    const flat = flattenTexts(texts)
    expect(flat).toContain('Tarte aux pommes')
    expect(flat).toContain('au goût')
    expect(flat).toContain('Mélanger.')
  })
})

describe('sourceHash', () => {
  const base = recipeTexts(detail)

  it('est stable et change avec chaque texte traduisible', () => {
    expect(sourceHash(base)).toBe(sourceHash(recipeTexts(structuredClone(detail))))
    expect(sourceHash(base)).toMatch(/^[0-9a-f]{28}$/)
    const edit = (change: (copy: typeof detail) => void) => {
      const copy = structuredClone(detail)
      change(copy)
      return sourceHash(recipeTexts(copy))
    }
    const hashes = new Set([
      sourceHash(base),
      edit(copy => { copy.title = 'Tarte aux poires' }),
      edit(copy => { copy.description = 'Autre.' }),
      edit(copy => { copy.notes = 'Une note.' as never }),
      edit(copy => { copy.tags = ['vegan'] }),
      edit(copy => { copy.sections[0]!.name = 'Cuisson' }),
      edit(copy => { copy.sections[0]!.instructions[0]!.content = 'Cuire 40 min.' }),
      edit(copy => { copy.sections[1]!.ingredients[1]!.name = 'sel fin' }),
      edit(copy => { copy.sections[1]!.ingredients[0]!.amount = 'une pincée' })
    ])
    expect(hashes.size).toBe(9)
  })

  it('ignore ce qui ne se traduit pas : quantités chiffrées, unités codées, photo, temps', () => {
    const copy = structuredClone(detail)
    copy.sections[1]!.ingredients[1]!.amount = '300'
    copy.sections[1]!.ingredients[1]!.unit = 'kg'
    copy.sections[1]!.ingredients[1]!.unitCode = 'kg'
    expect(sourceHash(recipeTexts(copy))).toBe(sourceHash(base))
  })

  it('l\'empreinte d\'une entrée d\'éditeur égale celle de la recette relue en base', () => {
    const input: RecipeInput = {
      title: ' Tarte aux pommes ',
      category: 'plats',
      description: 'Une tarte simple.',
      tags: ['végétarien'],
      sections: [
        { name: 'Pâte', orderIndex: 0, ingredients: [
          { name: 'farine', amount: 250, unit: 'g', unitCode: 'g', orderIndex: 0 },
          { name: 'sel', amount: 'au goût', orderIndex: 1 },
          { name: 'stick de beurre', amount: 1, unit: 'stick', orderIndex: 2 }
        ] },
        { name: 'Préparation', orderIndex: 1, instructions: ['Mélanger.', '  ', { content: 'Cuire.', orderIndex: 2 }] }
      ]
    }
    expect(sourceHash(inputTexts(input))).toBe(sourceHash(recipeTexts(detail)))
  })
})

describe('forme et nettoyage d\'une traduction', () => {
  const texts = recipeTexts(detail)
  const draft: TranslationDraft = {
    title: ' Apple pie ',
    description: ' A simple pie. ',
    notes: 'Invented note',
    tags: ['vegetarian', ' '],
    content: {
      sections: [
        { name: 'Dough', ingredients: [
          { name: 'flour', amount: '250 (invented)', unit: 'g' },
          { name: 'salt', amount: ' to taste ', unit: null },
          { name: 'butter stick', amount: null, unit: ' stick ' }
        ], instructions: [] },
        { name: 'Method', ingredients: [], instructions: ['Mix.', 'Bake.'] }
      ]
    }
  }

  it('contentMatchesTexts compare sections, ingrédients et étapes', () => {
    expect(contentMatchesTexts(draft.content, texts)).toBe(true)
    expect(contentMatchesTexts({ sections: draft.content.sections.slice(1) }, texts)).toBe(false)
    expect(contentMatchesTexts(null, texts)).toBe(false)
    const fewerSteps = structuredClone(draft.content)
    fewerSteps.sections[1]!.instructions.pop()
    expect(contentMatchesTexts(fewerSteps, texts)).toBe(false)
    expect(translationShapeProblem(texts, draft)).toBeNull()
    expect(translationShapeProblem(texts, { ...draft, title: ' ' })).toContain('titre')
    expect(translationShapeProblem(texts, { ...draft, content: { sections: [] } })).toContain('ne correspondent pas')
  })

  it('normalizeDraft ne confie pas les quantités chiffrées au modèle et retire les textes inventés', () => {
    const clean = normalizeDraft(texts, draft)
    expect(clean.title).toBe('Apple pie')
    expect(clean.description).toBe('A simple pie.')
    expect(clean.notes).toBeNull()                        // l'original n'a pas de notes
    expect(clean.tags).toEqual(['vegetarian'])
    const ingredients = clean.content.sections[0]!.ingredients
    expect(ingredients[0]).toEqual({ name: 'flour', amount: null, unit: null })  // quantité numérique d'origine : rien à traduire
    expect(ingredients[1]).toEqual({ name: 'salt', amount: 'to taste', unit: null })
    expect(ingredients[2]).toEqual({ name: 'butter stick', amount: null, unit: 'stick' })
  })
})

describe('affichage dans la langue de l\'interface', () => {
  const row: RecipeWithSectionsRow = {
    id: 'r1', title: 'Tarte aux pommes', description: 'Une tarte simple.', category: 'desserts et gâteaux',
    prep_time: 10, cook_time: 40, servings: 6, photo_path: null, tags: ['végétarien'], notes: 'Servir tiède.',
    created_at: null, updated_at: null, lang: 'fr',
    recipe_translations: [{
      locale: 'en', title: 'Apple pie', description: 'A simple pie.', notes: 'Serve warm.', tags: ['vegetarian'], stale: false,
      source_hash: 'h', model: 'mock', translated_at: '2026-10-18T10:00:00Z',
      content: { sections: [
        { name: 'Dough', ingredients: [{ name: 'flour', amount: null, unit: null }, { name: 'salt', amount: 'to taste', unit: null }], instructions: [] },
        { name: 'Method', ingredients: [], instructions: ['Mix.', 'Bake.'] }
      ] }
    }],
    recipe_sections: [
      { id: 's2', recipe_id: 'r1', name: 'Préparation', type: 'instructions', order_index: 1, created_at: null, updated_at: null, recipe_ingredients: [],
        instructions: [
          { id: 'i2', recipe_id: 'r1', section_id: 's2', content: 'Cuire.', order_index: 1, created_at: null, updated_at: null },
          { id: 'i1', recipe_id: 'r1', section_id: 's2', content: 'Mélanger.', order_index: 0, created_at: null, updated_at: null }
        ] },
      { id: 's1', recipe_id: 'r1', name: 'Pâte', type: 'ingredients', order_index: 0, created_at: null, updated_at: null, instructions: [],
        recipe_ingredients: [
          { id: 'g2', recipe_id: 'r1', section_id: 's1', name: 'sel', amount: 'au goût', amount_num: null, unit: null, unit_code: null, optional: false, order_index: 1, created_at: null, updated_at: null },
          { id: 'g1', recipe_id: 'r1', section_id: 's1', name: 'farine', amount: '250', amount_num: 250, unit: 'g', unit_code: 'g', optional: false, order_index: 0, created_at: null, updated_at: null }
        ] }
    ]
  }
  const recipe: Recipe = toRecipe(row)

  it('toSummaryTranslation lit la relation, le JSON de search_recipes, et ignore une traduction périmée', () => {
    expect(toSummaryTranslation(row)).toMatchObject({ locale: 'en', title: 'Apple pie', tags: ['vegetarian'] })
    expect(toSummaryTranslation({ ...row, recipe_translations: [{ ...row.recipe_translations![0]!, stale: true }] })).toBeNull()
    expect(toSummaryTranslation({ ...row, recipe_translations: null, translation: { locale: 'fr', title: 'X', description: null, notes: null, tags: [] } }))
      .toMatchObject({ locale: 'fr', title: 'X' })
    expect(toSummaryTranslation({ ...row, recipe_translations: null, translation: null })).toBeNull()
    expect(toSummaryTranslation({ ...row, recipe_translations: [{ ...row.recipe_translations![0]!, title: ' ' }] })).toBeNull()
    expect(toRecipeSummary({ ...row, lang: 'xx' }).lang).toBe('fr')
  })

  it('résumé : texte traduit sur /en, texte d\'origine sur /', () => {
    const summary = toRecipeSummary(row)
    const en = localizeSummary(summary, 'en')
    expect(en).toMatchObject({ title: 'Apple pie', description: 'A simple pie.', notes: 'Serve warm.', tags: ['vegetarian'], displayLang: 'en' })
    const fr = localizeSummary(summary, 'fr')
    expect(fr).toMatchObject({ title: 'Tarte aux pommes', tags: ['végétarien'], displayLang: 'fr' })
  })

  it('résumé : repli sur l\'origine sans traduction, tags d\'origine si le nombre diffère', () => {
    const noTranslation = toRecipeSummary({ ...row, recipe_translations: [] })
    expect(localizeSummary(noTranslation, 'en')).toMatchObject({ title: 'Tarte aux pommes', displayLang: 'fr' })
    const tagsOff = toRecipeSummary({ ...row, recipe_translations: [{ ...row.recipe_translations![0]!, tags: [] }] })
    expect(localizeSummary(tagsOff, 'en')).toMatchObject({ title: 'Apple pie', tags: ['végétarien'] })
  })

  it('recette anglaise traduite en français : la source reste affichée sur /en', () => {
    const english = toRecipeSummary({ ...row, lang: 'en', recipe_translations: [{ ...row.recipe_translations![0]!, locale: 'fr', title: 'Tarte' }] })
    expect(localizeSummary(english, 'en')).toMatchObject({ title: 'Tarte aux pommes', displayLang: 'en' })
    expect(localizeSummary(english, 'fr')).toMatchObject({ title: 'Tarte', displayLang: 'fr' })
  })

  it('fiche : textes des sections traduits par position, quantités et unités codées conservées', () => {
    const en = localizeRecipe(recipe, 'en')
    expect(en.displayLang).toBe('en')
    expect(en.title).toBe('Apple pie')
    expect(en.sections.map(section => section.name)).toEqual(['Dough', 'Method'])
    const [flour, salt] = en.sections[0]!.ingredients
    expect(flour).toMatchObject({ name: 'flour', amount: '250', amountNum: 250, unitCode: 'g', unit: 'g' })
    expect(salt).toMatchObject({ name: 'salt', amount: 'to taste', amountNum: null })
    expect(en.sections[1]!.instructions.map(step => step.content)).toEqual(['Mix.', 'Bake.'])
    // ids et ordre conservés : le mode cuisine et les courses continuent de fonctionner
    expect(en.sections[0]!.id).toBe('s1')
    expect(en.sections[1]!.instructions.map(step => step.id)).toEqual(['i1', 'i2'])
    const fr = localizeRecipe(recipe, 'fr')
    expect(fr.title).toBe('Tarte aux pommes')
    expect(fr.sections.map(section => section.name)).toEqual(['Pâte', 'Préparation'])
  })

  it('fiche : repli sur l\'origine si la traduction n\'a plus la forme de la recette', () => {
    const edited = structuredClone(recipe)
    edited.sections[0]!.instructions.push({ id: 'i3', sectionId: 's2', content: 'Servir.', orderIndex: 2 })
    const result = localizeRecipe(edited, 'en')
    expect(result.displayLang).toBe('fr')
    expect(result.title).toBe('Tarte aux pommes')
    const noContent = { ...recipe, translation: null }
    expect(localizeRecipe(noContent, 'en').displayLang).toBe('fr')
  })

  it('fiche : contenu tel que stocké en prod (clés null absentes, section sans ingrédient) toujours appliqué', () => {
    // `jsonb_strip_nulls` : ni `unit` ni `amount` dans les ingrédients ; les textes d'origine sont gardés pour ce qui manque.
    const stripped = toRecipe({ ...row, recipe_translations: [{ ...row.recipe_translations![0]!,
      content: { sections: [
        { name: 'Dough', ingredients: [{ name: 'flour' }, { name: 'salt' }], instructions: [] },
        { name: 'Method', ingredients: [], instructions: ['Mix.', 'Bake.'] }
      ] } as never }] })
    const en = localizeRecipe(stripped, 'en')
    expect(en.displayLang).toBe('en')
    const [flour, salt] = en.sections[0]!.ingredients
    expect(flour).toMatchObject({ name: 'flour', amount: '250', unitCode: 'g' })
    expect(salt).toMatchObject({ name: 'salt', amount: 'au goût' })
  })

  it('fiche : une traduction périmée n\'est jamais appliquée', () => {
    const stale = toRecipe({ ...row, recipe_translations: [{ ...row.recipe_translations![0]!, stale: true }] })
    expect(stale.translation).toBeNull()
    expect(localizeRecipe(stale, 'en').title).toBe('Tarte aux pommes')
  })
})

describe('aperçu du traducteur : translatedInput', () => {
  const recipe: RecipeInput = {
    title: 'Tarte', category: 'plats', description: null, tags: ['vegan'],
    sections: [
      { name: 'Pâte', orderIndex: 0, ingredients: [{ name: 'farine', amount: 250, unit: 'g', unitCode: 'g', orderIndex: 0 }, { name: 'sel', amount: 'au goût', orderIndex: 1 }],
        instructions: ['Pétrir.', ' ', { content: 'Cuire.', orderIndex: 2 }] }
    ]
  }
  const draft: TranslationDraft = {
    title: 'Pie', description: null, notes: null, tags: ['vegan'],
    content: { sections: [{ name: 'Dough', ingredients: [{ name: 'flour', amount: null, unit: null }, { name: 'salt', amount: 'to taste', unit: null }], instructions: ['Knead.', 'Bake.'] }] }
  }

  it('remplace les textes, garde nombres et codes d\'unité, saute les étapes vides', () => {
    const result = translatedInput(recipe, draft)!
    expect(result.title).toBe('Pie')
    expect(result.sections![0]!.name).toBe('Dough')
    expect(result.sections![0]!.ingredients![0]).toMatchObject({ name: 'flour', amount: 250, unitCode: 'g' })
    expect(result.sections![0]!.ingredients![1]).toMatchObject({ name: 'salt', amount: 'to taste' })
    expect(result.sections![0]!.instructions).toEqual(['Knead.', ' ', { content: 'Bake.', orderIndex: 2 }])
    expect(result.category).toBe('plats')
  })

  it('renvoie null si la forme ne correspond pas', () => {
    expect(translatedInput(recipe, { ...draft, content: { sections: [] } })).toBeNull()
  })
})
