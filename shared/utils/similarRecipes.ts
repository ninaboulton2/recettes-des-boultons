import { normalizeAccents } from './text'

/**
 * Détection de recettes en double : une recette « candidate » (aperçu du
 * traducteur) est comparée à celles déjà en base.
 *
 * Fonctions pures, partagées client/serveur (aucun accès réseau ni base) :
 * `server/utils/similarRecipes.ts` charge les recettes, ce module les note.
 *
 * Deux signaux, combinés dans `findSimilarRecipes` :
 *  1. le TITRE normalisé (minuscules, sans accents ni ponctuation, sans mots
 *     vides « de, la, aux, à la… », pluriels ramenés au singulier) : identique ou
 *     presque identique (faute de frappe, ordre des mots) ;
 *  2. le recouvrement des INGRÉDIENTS (Jaccard pondéré), pour retrouver une
 *     recette renommée (« Gâteau aux carottes » / « Carrot cake »). Pas de
 *     traduction FR/EN des titres : seuls les ingrédients de même langue se
 *     recoupent.
 */

/** Réglages de la détection (voir DEVELOPER.md, « Détection des doublons »). */
export const SIMILARITY = {
  /** Titre : au moins ce score pour compter à lui seul (1 = identique après normalisation). */
  titleMatch: 0.8,
  /** Ingrédients : au moins ce score (Jaccard pondéré) pour compter à eux seuls. */
  ingredientsMatch: 0.7,
  /** Signal combiné : titre assez proche ET ingrédients assez proches, sans que l'un suffise. */
  combinedTitle: 0.55,
  combinedIngredients: 0.4,
  /** Sous ce nombre d'ingrédients (d'un côté ou de l'autre), le signal ingrédients est ignoré. */
  minIngredients: 4,
  /** Nombre minimal d'ingrédients communs pour que le signal ingrédients compte. */
  minShared: 3,
  /** Nombre maximal de recettes proposées. */
  maxResults: 3
} as const

export interface RecipeFingerprint {
  id: string
  title: string
  ingredientNames: readonly string[]
}

export interface SimilarityQuery {
  title: string
  ingredientNames: readonly string[]
}

export type SimilarityReason = 'title' | 'ingredients' | 'both'

export interface SimilarRecipe {
  id: string
  title: string
  /** Score de classement, entre 0 et 1 (plus c'est haut, plus c'est proche). */
  score: number
  titleScore: number
  ingredientScore: number
  reason: SimilarityReason
}

// --- Normalisation du texte --------------------------------------------------

/** Mots vides ignorés dans les titres et les noms d'ingrédients (français et anglais). */
const STOPWORDS = new Set([
  // français (« à » devient « a » après suppression des accents)
  'a', 'au', 'aux', 'de', 'des', 'du', 'd', 'l', 'la', 'le', 'les', 'un', 'une', 'et', 'en', 'sur', 'sous',
  'avec', 'sans', 'pour', 'ou', 'ma', 'mon', 'mes', 'ta', 'ton', 'sa', 'son', 'ses', 'notre', 'nos', 'ce', 'cette',
  // anglais
  'the', 'of', 'with', 'and', 'an', 'in', 'on', 'for', 'to', 'my', 'our', 'your', 'style'
])

/** Mots de préparation ignorés dans les ingrédients (« beurre doux, ramolli » = « beurre »). */
const PREPARATION_WORDS = new Set([
  'frais', 'fraiche', 'fraiches', 'fondu', 'fondue', 'ramolli', 'ramollie', 'doux', 'douce', 'hache', 'hachee',
  'emince', 'emincee', 'coupe', 'coupee', 'rape', 'rapee', 'moulu', 'moulue', 'pele', 'pelee', 'lave', 'lavee',
  'sec', 'seche', 'entier', 'entiere', 'petit', 'petite', 'gros', 'grosse', 'grand', 'grande', 'bio', 'mur', 'mure',
  'fresh', 'chopped', 'sliced', 'grated', 'melted', 'softened', 'large', 'small', 'ground', 'dried'
])

/** Minuscules, sans accents, « œ » → « oe », tout ce qui n'est pas lettre ou chiffre devient espace. */
function toWords(value: string): string[] {
  return normalizeAccents(value)
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(word => word !== '')
}

/** Pluriel → singulier, grossièrement (« gâteaux » = « gateau », « carottes » = « carotte »). */
function singular(word: string): string {
  if (word.length > 3 && /[sx]$/.test(word) && !/(ss|us)$/.test(word)) return word.slice(0, -1)
  return word
}

/** Mots significatifs d'un titre, sans doublon, triés : « Gâteau aux carottes » → `carotte gateau`. */
export function titleTokens(title: string): string[] {
  const words = toWords(title)
    .filter(word => !STOPWORDS.has(word))
    .map(singular)
  return [...new Set(words)].sort()
}

/** Titre normalisé (mots significatifs triés, séparés par une espace). */
export function normalizeTitle(title: string): string {
  return titleTokens(title).join(' ')
}

/**
 * Clé d'un nom d'ingrédient : « Beurre doux, ramolli » → `beurre`,
 * « Œufs (gros) » → `oeuf`. Vide si rien de significatif.
 */
export function ingredientKey(name: string): string {
  const main = name.split(/[,;(]/)[0] ?? ''
  const words = toWords(main)
    .filter(word => !STOPWORDS.has(word) && !PREPARATION_WORDS.has(word) && !PREPARATION_WORDS.has(singular(word)))
    .map(singular)
  return [...new Set(words)].sort().join(' ')
}

/** Ensemble des clés d'ingrédients d'une recette. */
function ingredientKeys(names: readonly string[]): Set<string> {
  const keys = new Set<string>()
  for (const name of names) {
    const key = ingredientKey(name)
    if (key !== '') keys.add(key)
  }
  return keys
}

// --- Similarité de titres ----------------------------------------------------

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1
      current[j] = Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + cost)
    }
    previous = current
  }
  return previous[b.length] ?? 0
}

/**
 * Ressemblance de deux titres, de 0 à 1 : 1 pour des titres identiques une fois
 * normalisés (accents, casse, ponctuation, mots vides, pluriels, ordre des mots).
 * Sinon le meilleur de deux mesures : coefficient de Dice sur les mots (un mot
 * en plus ou en moins) et proximité des lettres (faute de frappe).
 */
export function titleSimilarity(a: string, b: string): number {
  const tokensA = titleTokens(a)
  const tokensB = titleTokens(b)
  if (tokensA.length === 0 || tokensB.length === 0) return 0
  const joinedA = tokensA.join(' ')
  const joinedB = tokensB.join(' ')
  if (joinedA === joinedB) return 1

  const setB = new Set(tokensB)
  const shared = tokensA.filter(token => setB.has(token)).length
  const dice = (2 * shared) / (tokensA.length + tokensB.length)
  const letters = 1 - levenshtein(joinedA, joinedB) / Math.max(joinedA.length, joinedB.length)
  return Math.max(dice, letters)
}

// --- Similarité d'ingrédients ------------------------------------------------

/** Nombre de recettes (du corpus) qui contiennent chaque ingrédient. */
function documentFrequencies(corpusKeys: readonly Set<string>[]): Map<string, number> {
  const frequencies = new Map<string, number>()
  for (const keys of corpusKeys) {
    for (const key of keys) frequencies.set(key, (frequencies.get(key) ?? 0) + 1)
  }
  return frequencies
}

/**
 * Jaccard PONDÉRÉ des ingrédients de deux recettes : un ingrédient présent dans
 * presque toutes les recettes (farine, sucre, sel…) pèse peu, un ingrédient rare
 * (« carotte », « pépites de chocolat ») pèse beaucoup. Poids = ln((N+1)/(df+1)) + 1.
 * 0 si l'un des côtés a moins de `minIngredients` ingrédients ou si moins de
 * `minShared` ingrédients sont communs.
 */
function weightedJaccard(
  a: ReadonlySet<string>,
  b: ReadonlySet<string>,
  weightOf: (key: string) => number
): number {
  if (a.size < SIMILARITY.minIngredients || b.size < SIMILARITY.minIngredients) return 0
  let sharedWeight = 0
  let sharedCount = 0
  let unionWeight = 0
  for (const key of a) {
    unionWeight += weightOf(key)
    if (b.has(key)) {
      sharedWeight += weightOf(key)
      sharedCount++
    }
  }
  for (const key of b) {
    if (!a.has(key)) unionWeight += weightOf(key)
  }
  if (sharedCount < SIMILARITY.minShared || unionWeight === 0) return 0
  return sharedWeight / unionWeight
}

/** Ressemblance des ingrédients de deux recettes (poids uniformes), de 0 à 1. */
export function ingredientSimilarity(a: readonly string[], b: readonly string[]): number {
  return weightedJaccard(ingredientKeys(a), ingredientKeys(b), () => 1)
}

// --- Recherche ---------------------------------------------------------------

const round = (value: number) => Math.round(value * 1000) / 1000

/**
 * Recettes du `corpus` qui ressemblent à `query`, de la plus proche à la moins
 * proche (au plus `maxResults`). Une recette est retenue si :
 *  - son titre est (quasi) identique (`titleMatch`), OU
 *  - ses ingrédients recoupent ceux de la requête (`ingredientsMatch`), OU
 *  - titre et ingrédients sont chacun assez proches (`combined*`).
 * `excludeId` écarte une recette (ex. celle qu'on est en train de modifier).
 */
export function findSimilarRecipes(
  query: SimilarityQuery,
  corpus: readonly RecipeFingerprint[],
  options: { excludeId?: string, maxResults?: number } = {}
): SimilarRecipe[] {
  const candidates = corpus.filter(recipe => recipe.id !== options.excludeId)
  const queryKeys = ingredientKeys(query.ingredientNames)
  const candidateKeys = candidates.map(recipe => ingredientKeys(recipe.ingredientNames))

  const frequencies = documentFrequencies(candidateKeys)
  const total = candidates.length
  const weightOf = (key: string) => Math.log((total + 1) / ((frequencies.get(key) ?? 0) + 1)) + 1

  const found: SimilarRecipe[] = []
  candidates.forEach((recipe, index) => {
    const titleScore = titleSimilarity(query.title, recipe.title)
    const ingredientScore = weightedJaccard(queryKeys, candidateKeys[index] ?? new Set(), weightOf)

    const byTitle = titleScore >= SIMILARITY.titleMatch
    const byIngredients = ingredientScore >= SIMILARITY.ingredientsMatch
    const byBoth = titleScore >= SIMILARITY.combinedTitle && ingredientScore >= SIMILARITY.combinedIngredients
    if (!byTitle && !byIngredients && !byBoth) return

    found.push({
      id: recipe.id,
      title: recipe.title,
      score: round(Math.max(byTitle ? titleScore : 0, byIngredients ? ingredientScore : 0, byBoth ? (titleScore + ingredientScore) / 2 : 0)),
      titleScore: round(titleScore),
      ingredientScore: round(ingredientScore),
      reason: byTitle ? (byIngredients || byBoth ? 'both' : 'title') : byIngredients ? 'ingredients' : 'both'
    })
  })

  return found
    .sort((x, y) => y.score - x.score || y.titleScore - x.titleScore || x.title.localeCompare(y.title))
    .slice(0, options.maxResults ?? SIMILARITY.maxResults)
}
