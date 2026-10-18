import type { Ingredient, Recipe, RecipeLang, RecipeSummary, RecipeTranslation, SummaryTranslation } from '../types'
import type { RecipeInput } from '../schemas/recipe'
import { amountToText } from '../schemas/common'

/**
 * Recettes bilingues (fr / en) : logique pure, partagée client / serveur.
 *
 * MODÈLE (migration 0016)
 *  - `recipes.lang` : langue du texte saisi. `recipe_translations` : la
 *    traduction vers l'AUTRE langue (une ligne par recette).
 *  - `content` de la traduction = les textes des sections PAR POSITION (section
 *    n° i, ingrédient n° j, étape n° k, dans l'ordre `order_index`), car
 *    `save_recipe` recrée tous les enfants (nouveaux identifiants) à chaque
 *    enregistrement.
 *  - `source_hash` = empreinte des textes sources traduisibles : elle change
 *    quand l'un d'eux change (une quantité purement numérique n'entre pas dans
 *    l'empreinte : « 200 » se « traduit » en « 200 »).
 *
 * AFFICHAGE : `localizeRecipe` / `localizeSummary` donnent le texte dans la
 * langue demandée, avec repli sur le texte d'origine si la traduction manque,
 * est périmée (`stale`) ou ne correspond plus à la forme de la recette.
 */

export const RECIPE_LANGS = ['fr', 'en'] as const

export const isRecipeLang = (value: unknown): value is RecipeLang =>
  value === 'fr' || value === 'en'

/** L'autre langue : celle de la traduction d'une recette dont la langue source est `lang`. */
export const otherLang = (lang: RecipeLang): RecipeLang => (lang === 'fr' ? 'en' : 'fr')

/** Texte d'une quantité qui contient des mots (« au goût », « 2 à 3 », « une pincée ») : à traduire. */
export const amountHasWords = (amount: string | null | undefined): boolean =>
  amount != null && /\p{L}/u.test(amount)

// ---------------------------------------------------------------------------
// Textes traduisibles d'une recette
// ---------------------------------------------------------------------------

export interface TextIngredient {
  name: string
  /** Quantité en texte, `null` si absente ou purement numérique (rien à traduire). */
  amount: string | null
  /** Unité en texte libre, seulement quand elle n'a pas de code canonique. */
  unit: string | null
}

export interface TextSection {
  name: string
  ingredients: TextIngredient[]
  instructions: string[]
}

/** Tous les textes d'une recette à traduire, dans l'ordre d'affichage. */
export interface RecipeTexts {
  title: string
  description: string | null
  notes: string | null
  tags: string[]
  sections: TextSection[]
}

/** Forme minimale lue par `recipeTexts` : `Recipe` (lecture) et `RecipeDetail` (serveur) la respectent. */
export interface TranslatableRecipe {
  title: string
  description?: string | null
  notes?: string | null
  tags?: readonly string[] | null
  sections: ReadonlyArray<{
    name: string
    orderIndex: number
    ingredients: ReadonlyArray<Pick<Ingredient, 'name' | 'amount' | 'unit' | 'unitCode' | 'orderIndex'>>
    instructions: ReadonlyArray<{ content: string, orderIndex: number }>
  }>
}

const trimOrNull = (value: string | null | undefined): string | null => {
  if (value == null) return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

const byOrder = <T extends { orderIndex: number }>(a: T, b: T): number => a.orderIndex - b.orderIndex

/** Les textes à traduire d'une recette lue en base (sections triées par `orderIndex`). */
export function recipeTexts(recipe: TranslatableRecipe): RecipeTexts {
  return {
    title: recipe.title.trim(),
    description: trimOrNull(recipe.description),
    notes: trimOrNull(recipe.notes),
    tags: (recipe.tags ?? []).map(tag => tag.trim()).filter(tag => tag !== ''),
    sections: [...recipe.sections].sort(byOrder).map(section => ({
      name: section.name.trim(),
      ingredients: [...section.ingredients].sort(byOrder).map(ingredient => ({
        name: ingredient.name.trim(),
        amount: amountHasWords(ingredient.amount) ? trimOrNull(ingredient.amount) : null,
        unit: ingredient.unitCode ? null : trimOrNull(ingredient.unit)
      })),
      instructions: [...section.instructions].sort(byOrder).map(step => step.content.trim())
    }))
  }
}

/**
 * Les textes à traduire d'une recette telle que l'éditeur / le traducteur
 * l'envoie (`RecipeInput`), dans l'ordre que `save_recipe` lui donnera.
 */
export function inputTexts(recipe: RecipeInput): RecipeTexts {
  return {
    title: recipe.title.trim(),
    description: trimOrNull(recipe.description),
    notes: trimOrNull(recipe.notes),
    tags: (recipe.tags ?? []).map(tag => tag.trim()).filter(tag => tag !== ''),
    sections: inOrder(recipe.sections ?? []).map(section => ({
      name: (section.name ?? '').trim(),
      ingredients: inOrder(section.ingredients ?? []).map((ingredient) => {
        const amount = amountToText(ingredient.amount)
        return {
          name: ingredient.name.trim(),
          amount: amountHasWords(amount) ? amount : null,
          unit: ingredient.unitCode ? null : trimOrNull(ingredient.unit)
        }
      }),
      instructions: inOrder(section.instructions ?? [])
        .map(step => stepText(step).trim())
        .filter(step => step !== '')
    }))
  }
}

/** cyrb53 : empreinte 53 bits rapide et synchrone (détection de changement, pas de la sécurité). */
function cyrb53(text: string, seed: number): string {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0')
}

/** Empreinte (2 × 53 bits) des textes sources : change dès qu'un texte traduisible change. */
export function sourceHash(texts: RecipeTexts): string {
  const canonical = JSON.stringify(texts)
  return `${cyrb53(canonical, 0)}${cyrb53(canonical, 1)}`
}

// ---------------------------------------------------------------------------
// Contenu d'une traduction (par position)
// ---------------------------------------------------------------------------

export interface TranslationIngredient {
  name: string
  amount: string | null
  unit: string | null
}

export interface TranslationSection {
  name: string
  ingredients: TranslationIngredient[]
  instructions: string[]
}

export interface TranslationContent {
  sections: TranslationSection[]
}

/** Traduction prête à être enregistrée (`save_recipe_translation`), sans hash ni modèle. */
export interface TranslationDraft {
  title: string
  description: string | null
  notes: string | null
  tags: string[]
  content: TranslationContent
}

/** Sortie du modèle (`aiTranslationSchema`, sections à plat) → `TranslationDraft` (sections dans `content`). */
export function draftFromAi(translation: {
  title: string
  description: string | null
  notes: string | null
  tags: string[]
  sections: TranslationSection[]
}): TranslationDraft {
  return {
    title: translation.title,
    description: translation.description,
    notes: translation.notes,
    tags: translation.tags,
    content: { sections: translation.sections }
  }
}

/** Vrai si `content` a exactement la même forme que `texts` (sections, ingrédients, étapes). */
export function contentMatchesTexts(content: TranslationContent | null | undefined, texts: RecipeTexts): boolean {
  if (!content || !Array.isArray(content.sections)) return false
  if (content.sections.length !== texts.sections.length) return false
  return texts.sections.every((section, i) => {
    const translated = content.sections[i]
    return !!translated
      && Array.isArray(translated.ingredients) && Array.isArray(translated.instructions)
      && translated.ingredients.length === section.ingredients.length
      && translated.instructions.length === section.instructions.length
  })
}

/** Raisons pour lesquelles une traduction proposée par l'IA est inutilisable. */
export function translationShapeProblem(texts: RecipeTexts, draft: TranslationDraft): string | null {
  if (draft.title.trim() === '') return 'titre traduit vide'
  if (!contentMatchesTexts(draft.content, texts)) return 'les sections, ingrédients ou étapes traduits ne correspondent pas à la recette'
  return null
}

/**
 * Nettoie une traduction : les quantités sans mots gardent leur valeur
 * d'origine (jamais confiées au modèle), les espaces sont retirés.
 */
export function normalizeDraft(texts: RecipeTexts, draft: TranslationDraft): TranslationDraft {
  const clean = (value: string | null | undefined): string | null => trimOrNull(value)
  return {
    title: draft.title.trim(),
    description: texts.description === null ? null : clean(draft.description),
    notes: texts.notes === null ? null : clean(draft.notes),
    tags: draft.tags.map(tag => tag.trim()).filter(tag => tag !== ''),
    content: {
      sections: draft.content.sections.map((section, i) => ({
        name: section.name.trim(),
        ingredients: section.ingredients.map((ingredient, j) => {
          const source = texts.sections[i]?.ingredients[j]
          return {
            name: ingredient.name.trim(),
            amount: source?.amount == null ? null : clean(ingredient.amount),
            unit: source?.unit == null ? null : clean(ingredient.unit)
          }
        }),
        instructions: section.instructions.map(step => step.trim())
      }))
    }
  }
}

// ---------------------------------------------------------------------------
// Affichage dans la langue de l'interface
// ---------------------------------------------------------------------------

/** Traduction affichable pour `locale` ? (langue différente de la source, non périmée.) */
function usableTranslation<T extends SummaryTranslation>(
  lang: RecipeLang,
  translation: T | null | undefined,
  locale: RecipeLang
): T | null {
  if (!translation || locale === lang || translation.locale !== locale) return null
  return translation
}

/** Résumé (carte, liste, favori, planning) dans la langue `locale`, repli sur le texte d'origine. */
export function localizeSummary<T extends RecipeSummary>(recipe: T, locale: RecipeLang): T & { displayLang: RecipeLang } {
  const translation = usableTranslation(recipe.lang, recipe.translation, locale)
  if (!translation) return { ...recipe, displayLang: recipe.lang }
  const tags = translation.tags.length === recipe.tags.length ? translation.tags : recipe.tags
  return {
    ...recipe,
    title: translation.title,
    description: translation.description ?? '',
    notes: translation.notes ?? '',
    tags,
    displayLang: translation.locale
  }
}

/**
 * Fiche complète dans la langue `locale`. La traduction n'est appliquée que si
 * sa forme correspond à la recette (même nombre de sections, d'ingrédients et
 * d'étapes) : sinon repli sur le texte d'origine.
 */
export function localizeRecipe(recipe: Recipe, locale: RecipeLang): Recipe & { displayLang: RecipeLang } {
  const translation = usableTranslation<RecipeTranslation>(recipe.lang, recipe.translation, locale)
  if (!translation || !contentMatchesTexts(translation.content, recipeTexts(recipe))) {
    return { ...recipe, displayLang: recipe.lang }
  }
  // `recipeTexts` trie par `orderIndex` : on parcourt dans le même ordre.
  const orderedSections = [...recipe.sections].sort(byOrder)
  const sections = orderedSections.map((section, i) => {
    const translated = translation.content.sections[i]!
    const ingredients = [...section.ingredients].sort(byOrder).map((ingredient, j) => {
      const t = translated.ingredients[j]!
      return {
        ...ingredient,
        name: t.name.trim() !== '' ? t.name : ingredient.name,
        amount: t.amount != null && t.amount.trim() !== '' ? t.amount : ingredient.amount,
        unit: !ingredient.unitCode && t.unit != null && t.unit.trim() !== '' ? t.unit : ingredient.unit
      }
    })
    const instructions = [...section.instructions].sort(byOrder).map((step, k) => ({
      ...step,
      content: translated.instructions[k]!.trim() !== '' ? translated.instructions[k]! : step.content
    }))
    return { ...section, name: translated.name, ingredients, instructions }
  })
  return { ...localizeSummary(recipe, locale), sections }
}

/** Éléments d'une liste de `RecipeInput` dans l'ordre de `save_recipe` (`orderIndex`, sinon position). */
function inOrder<T>(items: readonly T[]): T[] {
  const orderOf = (item: T): number | undefined =>
    typeof item === 'object' && item !== null ? (item as { orderIndex?: number }).orderIndex : undefined
  return items
    .map((item, index) => ({ item, key: orderOf(item) ?? index, index }))
    .sort((a, b) => a.key - b.key || a.index - b.index)
    .map(({ item }) => item)
}

type InputStep = NonNullable<NonNullable<RecipeInput['sections']>[number]['instructions']>[number]
const stepText = (step: InputStep): string => (typeof step === 'string' ? step : step.content)

/**
 * La recette de l'éditeur / du traducteur dans l'autre langue (aperçu avant
 * ajout). Même structure, textes remplacés par la traduction ; `null` si la
 * traduction ne correspond pas à la recette.
 */
export function translatedInput(recipe: RecipeInput, draft: TranslationDraft): RecipeInput | null {
  if (!contentMatchesTexts(draft.content, inputTexts(recipe))) return null
  const sections = inOrder(recipe.sections ?? []).map((section, i) => {
    const translated = draft.content.sections[i]!
    const ingredients = inOrder(section.ingredients ?? []).map((ingredient, j) => {
      const t = translated.ingredients[j]!
      return {
        ...ingredient,
        name: t.name !== '' ? t.name : ingredient.name,
        amount: t.amount ?? ingredient.amount,
        unit: !ingredient.unitCode && t.unit ? t.unit : ingredient.unit
      }
    })
    // Les étapes vides ne sont pas enregistrées (donc pas traduites) : on les saute.
    let next = 0
    const instructions = inOrder(section.instructions ?? []).map((step): InputStep => {
      if (stepText(step).trim() === '') return step
      const content = translated.instructions[next++] ?? stepText(step)
      return typeof step === 'string' ? content : { ...step, content }
    })
    return { ...section, name: translated.name, ingredients, instructions }
  })
  return {
    ...recipe,
    title: draft.title,
    description: draft.description ?? recipe.description ?? null,
    notes: draft.notes ?? recipe.notes ?? null,
    tags: draft.tags.length === (recipe.tags ?? []).length ? draft.tags : recipe.tags,
    sections
  }
}

// ---------------------------------------------------------------------------
// Détection de la langue (repli sans IA : fournisseur simulé, tests)
// ---------------------------------------------------------------------------

const FR_WORDS = new Set(['le', 'la', 'les', 'de', 'des', 'du', 'un', 'une', 'et', 'au', 'aux', 'avec', 'pour', 'dans', 'sur', 'sans',
  'cuire', 'ajouter', 'mélanger', 'melanger', 'farine', 'beurre', 'sucre', 'œufs', 'oeufs', 'sel', 'poivre', 'four', 'puis',
  'laisser', 'verser', 'couper', 'faire', 'cuillère', 'cuillere', 'pincée', 'pincee', 'goût', 'gout', 'préchauffer', 'préchauffez'])
const EN_WORDS = new Set(['the', 'and', 'with', 'for', 'into', 'until', 'add', 'mix', 'bake', 'flour', 'butter', 'sugar', 'eggs', 'egg', 'salt',
  'pepper', 'oven', 'then', 'stir', 'cut', 'cup', 'cups', 'tablespoon', 'teaspoon', 'pinch', 'taste', 'preheat', 'of', 'to',
  'in', 'an', 'about', 'cool', 'serve', 'chopped', 'minced'])

/**
 * Devine la langue d'un texte (fr ou en) en comptant des mots courants. Sert
 * au fournisseur simulé et de repli ; le vrai fournisseur détecte la langue
 * lui-même. Égalité ou texte vide : français (langue par défaut du site).
 */
export function detectLanguage(text: string): RecipeLang {
  const words = text.toLowerCase().match(/[\p{L}'’œ]+/gu) ?? []
  let fr = 0
  let en = 0
  for (const word of words) {
    if (FR_WORDS.has(word)) fr++
    if (EN_WORDS.has(word)) en++
  }
  const accents = (text.match(/[àâçéèêëîïôùûüœ]/gi) ?? []).length
  fr += Math.min(accents, 10) / 2
  return en > fr ? 'en' : 'fr'
}

/** Tous les textes d'une recette à plat (détection de langue, estimation de taille). */
export function flattenTexts(texts: RecipeTexts): string {
  return [
    texts.title, texts.description ?? '', texts.notes ?? '', ...texts.tags,
    ...texts.sections.flatMap(section => [
      section.name,
      ...section.ingredients.flatMap(ingredient => [ingredient.name, ingredient.amount ?? '', ingredient.unit ?? '']),
      ...section.instructions
    ])
  ].filter(part => part !== '').join('\n')
}
