import { describe, expect, it, vi } from 'vitest'
import type { RecipeLang } from '#shared/types'
import { sharedRecipeSchema } from '#shared/schemas/sharing'
import { localizeRecipe, localizedRecipeTitle, needsTranslation, recipeTexts, sourceHash, translationAction, type TranslationDraft } from '#shared/utils/translation'
import { sharedToRecipe } from '#shared/utils/sharedRecipe'
import { notificationView } from '#shared/utils/socialUi'
import {
  ensureRecipeTranslation,
  FAILURE_COOLDOWN_MS,
  TranslationGuard,
  type ExistingTranslation,
  type FailureKind,
  type RecipeForTranslation,
  type TranslationPorts
} from '../../server/utils/sharedTranslationCore'

/** Recettes partagées : affichage dans la langue de la personne qui lit, traduction à la demande (retour de test n° 1, point 3). */

const recipe = {
  title: 'Tarte aux pommes',
  description: 'Une tarte simple.',
  notes: null,
  tags: ['dessert'],
  sections: [{
    name: 'Pâte',
    orderIndex: 0,
    ingredients: [{ name: 'farine', amount: '250', unit: 'g', unitCode: 'g' as const, orderIndex: 0 }],
    instructions: [{ content: 'Mélanger.', orderIndex: 0 }]
  }]
}
const HASH = sourceHash(recipeTexts(recipe))

describe('translationAction', () => {
  const base = { recipeLang: 'fr' as RecipeLang, locale: 'en' as RecipeLang, hash: HASH }

  it('même langue : rien à faire', () => {
    expect(translationAction({ ...base, locale: 'fr', existing: null })).toBe('same-language')
  })

  it('aucune traduction, ou vers une autre langue, ou textes modifiés : à traduire', () => {
    expect(translationAction({ ...base, existing: null })).toBe('translate')
    expect(translationAction({ ...base, existing: { locale: 'fr', sourceHash: HASH, stale: false } })).toBe('translate')
    expect(translationAction({ ...base, existing: { locale: 'en', sourceHash: 'autre', stale: false } })).toBe('translate')
    expect(translationAction({ ...base, existing: { locale: 'en', sourceHash: 'autre', stale: true } })).toBe('translate')
  })

  it('à jour : prête ; périmée mais mêmes textes : revalidée', () => {
    expect(translationAction({ ...base, existing: { locale: 'en', sourceHash: HASH, stale: false } })).toBe('ready')
    expect(translationAction({ ...base, existing: { locale: 'en', sourceHash: HASH, stale: true } })).toBe('revalidate')
  })
})

describe('needsTranslation (navigateur)', () => {
  it('recette dans l\'autre langue et rien d\'appliqué : oui', () => {
    expect(needsTranslation({ recipeLang: 'fr', displayLang: 'fr', locale: 'en' })).toBe(true)
    expect(needsTranslation({ recipeLang: 'en', displayLang: 'en', locale: 'fr' })).toBe(true)
  })
  it('déjà dans la langue (origine ou traduction appliquée) : non', () => {
    expect(needsTranslation({ recipeLang: 'fr', displayLang: 'fr', locale: 'fr' })).toBe(false)
    expect(needsTranslation({ recipeLang: 'fr', displayLang: 'en', locale: 'en' })).toBe(false)
  })
})

describe('affichage d\'une recette partagée selon la langue de la personne', () => {
  const shared = (translation: unknown) => sharedRecipeSchema.parse({
    title: 'Tarte aux pommes', description: 'Une tarte simple.', category: 'desserts et gâteaux', prep_time: null, cook_time: null, servings: 4,
    tags: ['dessert'], notes: null, lang: 'fr', has_photo: false, author_name: 'Nina',
    sections: [{ name: 'Pâte', type: 'mixed', order_index: 0, ingredients: [{ name: 'farine', amount: '250', amount_num: 250, unit: 'g', unit_code: 'g', optional: false }], instructions: ['Mélanger.'] }],
    translation
  })
  const english = { locale: 'en', title: 'Apple pie', description: 'A simple pie.', notes: null, tags: ['dessert'], content: { sections: [{ name: 'Dough', ingredients: [{ name: 'flour', amount: null, unit: null }], instructions: ['Mix.'] }] } }

  it('amie en anglais : titre, ingrédients et étapes traduits', () => {
    const shown = localizeRecipe(sharedToRecipe(shared(english), 'shared:t'), 'en')
    expect(shown.displayLang).toBe('en')
    expect(shown.title).toBe('Apple pie')
    expect(shown.sections[0]?.name).toBe('Dough')
    expect(shown.sections[0]?.ingredients[0]?.name).toBe('flour')
    expect(shown.sections[0]?.instructions[0]?.content).toBe('Mix.')
  })

  it('amie en français : texte d\'origine', () => {
    expect(localizeRecipe(sharedToRecipe(shared(english), 'shared:t'), 'fr').title).toBe('Tarte aux pommes')
  })

  it('sans traduction : texte d\'origine, et le navigateur sait qu\'il faut en demander une', () => {
    const shown = localizeRecipe(sharedToRecipe(shared(null), 'shared:t'), 'en')
    expect(shown.title).toBe('Tarte aux pommes')
    expect(needsTranslation({ recipeLang: shown.lang, displayLang: shown.displayLang, locale: 'en' })).toBe(true)
  })

  it('traduction de forme différente (recette modifiée depuis) : texte d\'origine', () => {
    const shown = localizeRecipe(sharedToRecipe(shared({ ...english, content: { sections: [] } }), 'shared:t'), 'en')
    expect(shown.displayLang).toBe('fr')
  })
})

describe('localizedRecipeTitle / notifications', () => {
  const row = { title: 'Tarte aux pommes', lang: 'fr', recipe_translations: [{ locale: 'en', title: 'Apple pie', stale: false }] }

  it('titre traduit pour l\'autre langue, original sinon (même langue, périmé, absent)', () => {
    expect(localizedRecipeTitle(row, 'en')).toBe('Apple pie')
    expect(localizedRecipeTitle(row, 'fr')).toBe('Tarte aux pommes')
    expect(localizedRecipeTitle({ ...row, recipe_translations: [{ locale: 'en', title: 'Apple pie', stale: true }] }, 'en')).toBe('Tarte aux pommes')
    expect(localizedRecipeTitle({ ...row, recipe_translations: [] }, 'en')).toBe('Tarte aux pommes')
    expect(localizedRecipeTitle({ title: 'X', lang: null }, 'en')).toBe('X')
  })

  it('la notification « recette partagée » prend le titre dans la langue de l\'interface', () => {
    const id = '0b1c2d3e-0000-4000-8000-000000000001'
    const notification = { type: 'recipe_shared', payload: { recipe_id: id, title: 'Tarte aux pommes', from_name: 'Nina' } } as const
    expect(notificationView(notification)?.params.title).toBe('Tarte aux pommes')
    expect(notificationView(notification, { [id]: 'Apple pie' })?.params.title).toBe('Apple pie')
    expect(notificationView(notification, { autre: 'Apple pie' })?.params.title).toBe('Tarte aux pommes')
  })
})

describe('TranslationGuard', () => {
  it('une seule traduction à la fois par recette et par langue', () => {
    const guard = new TranslationGuard()
    expect(guard.tryStart('r:en')).toBe('started')
    expect(guard.tryStart('r:en')).toBe('busy')
    expect(guard.tryStart('r:fr')).toBe('started')
    guard.finish('r:en', true)
    expect(guard.tryStart('r:en')).toBe('started')
  })

  it('un échec n\'est pas rejoué avant le délai', () => {
    let now = 1_000
    const guard = new TranslationGuard(() => now)
    expect(guard.tryStart('r:en')).toBe('started')
    guard.finish('r:en', false)
    expect(guard.tryStart('r:en')).toBe('cooldown')
    now += FAILURE_COOLDOWN_MS - 1
    expect(guard.tryStart('r:en')).toBe('cooldown')
    now += 1
    expect(guard.tryStart('r:en')).toBe('started')
  })

  it('une réussite efface l\'échec précédent', () => {
    const guard = new TranslationGuard(() => 5)
    guard.tryStart('r:en')
    guard.finish('r:en', false)
    expect(guard.tryStart('r:en')).toBe('cooldown')
  })
})

describe('ensureRecipeTranslation', () => {
  const draft: TranslationDraft = { title: 'Apple pie', description: 'A simple pie.', notes: null, tags: ['dessert'], content: { sections: [{ name: 'Dough', ingredients: [{ name: 'flour', amount: null, unit: null }], instructions: ['Mix.'] }] } }

  function ports(overrides: Partial<{
    source: Partial<RecipeForTranslation>
    existing: ExistingTranslation | null
    translate: TranslationPorts['translate']
    save: TranslationPorts['save']
    revalidate: TranslationPorts['revalidate']
  }> = {}) {
    const calls = { translate: vi.fn(), save: vi.fn(), revalidate: vi.fn() }
    const value: TranslationPorts = {
      load: async () => ({ lang: 'fr', ownerId: 'auteure', recipe, ...overrides.source }),
      loadExisting: async () => (overrides.existing === undefined ? null : overrides.existing),
      revalidate: overrides.revalidate ?? (async (locale) => { calls.revalidate(locale); return true }),
      translate: overrides.translate ?? (async (owner, texts) => { calls.translate(owner, texts); return { sourceLanguage: 'fr', translation: draft, model: 'mock' } }),
      save: overrides.save ?? (async (lang, translation, hash, model) => { calls.save(lang, translation, hash, model); return true }),
      classify: (error): FailureKind => (error as { kind?: FailureKind }).kind ?? 'ai'
    }
    return { value, calls }
  }
  const input = { recipeId: 'r1', locale: 'en' as RecipeLang }

  it('recette déjà dans la langue : aucun appel', async () => {
    const { value, calls } = ports({ source: { lang: 'en' } })
    expect(await ensureRecipeTranslation(value, new TranslationGuard(), input)).toEqual({ status: 'same-language' })
    expect(calls.translate).not.toHaveBeenCalled()
  })

  it('traduction à jour : aucun appel IA', async () => {
    const { value, calls } = ports({ existing: { locale: 'en', sourceHash: HASH, stale: false } })
    expect(await ensureRecipeTranslation(value, new TranslationGuard(), input)).toEqual({ status: 'ready' })
    expect(calls.translate).not.toHaveBeenCalled()
  })

  it('traduction périmée mais mêmes textes : revalidée sans IA', async () => {
    const { value, calls } = ports({ existing: { locale: 'en', sourceHash: HASH, stale: true } })
    expect(await ensureRecipeTranslation(value, new TranslationGuard(), input)).toEqual({ status: 'ready' })
    expect(calls.revalidate).toHaveBeenCalledWith('en')
    expect(calls.translate).not.toHaveBeenCalled()
  })

  it('absente : traduite, appel compté sur l\'AUTEURE (jamais sur la personne qui lit), écrite avec l\'empreinte des textes', async () => {
    const { value, calls } = ports()
    expect(await ensureRecipeTranslation(value, new TranslationGuard(), input)).toEqual({ status: 'translated' })
    expect(calls.translate).toHaveBeenCalledTimes(1)
    expect(calls.translate.mock.calls[0]?.[0]).toBe('auteure')
    expect(calls.save).toHaveBeenCalledWith('fr', draft, HASH, 'mock')
  })

  it('auteur supprimé : rien n\'est traduit (personne à qui compter l\'appel)', async () => {
    const { value, calls } = ports({ source: { ownerId: null } })
    expect(await ensureRecipeTranslation(value, new TranslationGuard(), input)).toEqual({ status: 'unavailable', reason: 'no-owner' })
    expect(calls.translate).not.toHaveBeenCalled()
  })

  it('échec de l\'IA (plafond de l\'auteure, crédit) : indisponible, puis pas de nouvel appel pendant le délai', async () => {
    const translate = vi.fn(async () => { throw Object.assign(new Error('plafond'), { kind: 'quota' }) })
    const { value } = ports({ translate })
    const guard = new TranslationGuard()
    expect(await ensureRecipeTranslation(value, guard, input)).toEqual({ status: 'unavailable', reason: 'quota' })
    expect(await ensureRecipeTranslation(value, guard, input)).toEqual({ status: 'unavailable', reason: 'cooldown' })
    expect(translate).toHaveBeenCalledTimes(1)
  })

  it('échec d\'écriture : indisponible, l\'emplacement est libéré', async () => {
    const { value } = ports({ save: async () => false })
    const guard = new TranslationGuard()
    expect(await ensureRecipeTranslation(value, guard, input)).toEqual({ status: 'unavailable', reason: 'save' })
  })

  it('deux lectures simultanées : un seul appel IA, la seconde reçoit « busy »', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    const translate = vi.fn(async () => { await gate; return { sourceLanguage: 'fr' as RecipeLang, translation: draft, model: 'mock' } })
    const { value } = ports({ translate })
    const guard = new TranslationGuard()
    const first = ensureRecipeTranslation(value, guard, input)
    await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(await ensureRecipeTranslation(value, guard, input)).toEqual({ status: 'busy' })
    release()
    expect(await first).toEqual({ status: 'translated' })
    expect(translate).toHaveBeenCalledTimes(1)
  })
})
