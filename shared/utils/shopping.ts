import type { ShoppingItem } from '#shared/types'
import { DEFAULT_NUMBER_LOCALE, formatAmount } from './recipes'
import { normalizeAccents } from './text'

/**
 * Utilitaires purs des listes de courses (partagés client/serveur, testés
 * dans `test/unit/shopping-utils.test.ts`) : formatage « quantité + unité »,
 * répartition cochés / à acheter et regroupement par rayon.
 *
 * La fusion des doublons n'est PAS faite ici : elle est assurée en base par
 * `merge_shopping_item` (même nom replié + même `unit_code`).
 */

/** Article minimal pour le formatage de la quantité. */
export type QuantityLike = Pick<ShoppingItem, 'amount' | 'amountNum'>

/**
 * « 200 g », « 1 ½ c. à s. », « 2 », « » (aucune quantité).
 * `unitLabel` est le libellé déjà résolu par `useUnits().unitLabel(unitCode, unit)` ;
 * `locale` : format des nombres (« 2,5 » / « 2.5 »).
 */
export function formatQuantity(
  item: QuantityLike,
  unitLabel: string | null | undefined,
  locale: string = DEFAULT_NUMBER_LOCALE
): string {
  const amountText = typeof item.amount === 'number' ? String(item.amount) : item.amount
  const amount = formatAmount(item.amountNum, amountText, locale)
  const unit = unitLabel?.trim() ?? ''
  return [amount, unit].filter(Boolean).join(' ')
}

/** Répartit les articles entre « à acheter » et « cochés », dans l'ordre d'origine. */
export function splitChecked<T extends Pick<ShoppingItem, 'checked'>>(items: readonly T[]): { toBuy: T[], checked: T[] } {
  const toBuy: T[] = []
  const checked: T[] = []
  for (const item of items) {
    (item.checked ? checked : toBuy).push(item)
  }
  return { toBuy, checked }
}

/** Rayons proposés (libellés i18n : `shopping.aisles.<id>`), dans l'ordre d'un parcours de magasin. */
export const AISLES = [
  'produce',
  'bakery',
  'meatFish',
  'dairy',
  'grocery',
  'frozen',
  'beverages',
  'household',
  'other'
] as const

export type Aisle = (typeof AISLES)[number]

/**
 * Mots-clés → rayon (repliés par `foldName` au chargement). Le mot-clé reconnu
 * le plus long l'emporte (« lait de coco » avant « lait ») ; les surgelés
 * priment sur tout le reste (« petits pois surgelés » → surgelés).
 */
const AISLE_KEYWORDS: Record<Exclude<Aisle, 'other'>, readonly string[]> = {
  produce: [
    'tomate', 'oignon', 'ail', 'echalote', 'carotte', 'courgette', 'aubergine', 'poivron', 'pomme de terre',
    'patate', 'salade', 'laitue', 'roquette', 'epinard', 'poireau', 'celeri', 'fenouil', 'brocoli', 'chou',
    'haricot vert', 'petit pois', 'champignon', 'concombre', 'avocat', 'citron', 'orange', 'pomme', 'poire',
    'banane', 'fraise', 'framboise', 'myrtille', 'cerise', 'raisin', 'peche', 'abricot', 'prune', 'mangue',
    'ananas', 'kiwi', 'melon', 'pasteque', 'persil', 'basilic', 'coriandre', 'menthe', 'ciboulette', 'thym',
    'romarin', 'gingembre', 'radis', 'betterave', 'navet', 'potiron', 'courge', 'butternut', 'mais', 'endive',
    'asperge', 'artichaut', 'legume', 'fruit', 'herbe'
  ],
  bakery: ['pain', 'baguette', 'brioche', 'viennoiserie', 'croissant', 'tortilla', 'wrap', 'pita', 'naan', 'biscotte'],
  meatFish: [
    'poulet', 'dinde', 'canard', 'boeuf', 'veau', 'agneau', 'porc', 'lard', 'bacon', 'jambon', 'saucisse', 'chorizo',
    'merguez', 'steak', 'escalope', 'cote', 'gigot', 'roti', 'viande hachee', 'hache', 'lardon', 'saumon', 'thon',
    'cabillaud', 'morue', 'dorade', 'bar', 'truite', 'sardine', 'maquereau', 'crevette', 'moule', 'calamar',
    'poisson', 'viande', 'volaille', 'crustace', 'fruits de mer'
  ],
  dairy: [
    'lait', 'beurre', 'creme', 'yaourt', 'yogourt', 'fromage', 'parmesan', 'gruyere', 'comte', 'emmental',
    'mozzarella', 'feta', 'chevre', 'ricotta', 'mascarpone', 'camembert', 'brie', 'cheddar', 'oeuf', 'margarine',
    'fromage blanc', 'faisselle', 'petit suisse'
  ],
  frozen: ['surgele', 'congele', 'glace', 'sorbet', 'frites surgelees'],
  beverages: ['eau', 'jus d orange', 'jus de pomme', 'jus de fruit', 'jus de raisin', 'jus multifruit', 'jus', 'soda', 'cola', 'limonade', 'biere', 'vin', 'cidre', 'cafe', 'the', 'tisane', 'sirop', 'lait d amande', 'lait de coco', 'boisson'],
  household: [
    'liquide vaisselle', 'lessive', 'eponge', 'essuie tout', 'papier toilette', 'sac poubelle', 'savon', 'shampoing',
    'dentifrice', 'nettoyant', 'javel', 'aluminium', 'film etirable', 'papier cuisson', 'allumette', 'bougie'
  ],
  grocery: [
    'farine', 'sucre', 'sel', 'poivre', 'huile', 'vinaigre', 'riz', 'pate', 'spaghetti', 'penne', 'nouille',
    'semoule', 'boulgour', 'quinoa', 'lentille', 'pois chiche', 'haricot', 'conserve', 'boite', 'tomate pelee',
    'concentre', 'coulis', 'moutarde', 'mayonnaise', 'ketchup', 'sauce', 'bouillon', 'levure', 'chocolat', 'cacao',
    'vanille', 'cannelle', 'curry', 'cumin', 'paprika', 'piment', 'epice', 'miel', 'confiture', 'cereale', 'muesli',
    'avoine', 'amande', 'noix', 'noisette', 'cacahuete', 'pistache', 'raisin sec', 'biscuit', 'gateau', 'chips',
    'olive', 'capre', 'cornichon', 'soja', 'coco', 'maizena', 'fecule', 'gelatine', 'agar'
  ]
}

/** Singulier approximatif d'un mot (« tomates » → « tomate » ; « jus », « pois » inchangés). */
function singularize(word: string): string {
  return word.length > 3 && word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us') && !word.endsWith('is')
    ? word.slice(0, -1)
    : word
}

/**
 * Clé de comparaison : accents retirés, minuscules, ponctuation → espaces,
 * mots mis au singulier, encadrée d'espaces (recherche de mots entiers).
 */
export function foldName(name: string): string {
  const words = normalizeAccents(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map(singularize)
  return ` ${words.join(' ')} `
}

/** Mots-clés repliés : surgelés d'abord, puis du plus long au plus court (le plus spécifique l'emporte). */
const FOLDED_KEYWORDS: ReadonlyArray<{ aisle: Aisle, keyword: string }> = (
  Object.entries(AISLE_KEYWORDS) as Array<[Exclude<Aisle, 'other'>, readonly string[]]>
)
  .flatMap(([aisle, keywords]) => keywords.map(keyword => ({ aisle, keyword: foldName(keyword).trim() })))
  .sort((a, b) => Number(b.aisle === 'frozen') - Number(a.aisle === 'frozen') || b.keyword.length - a.keyword.length)

/**
 * Rayon déduit du nom de l'article (table statique de mots-clés), `other` par défaut.
 * Les mots-clés sont cherchés comme mots entiers (« thé » ne matche pas « thym »),
 * le plus long reconnu l'emporte (« haricot vert » avant « haricot »).
 */
export function aisleOf(name: string): Aisle {
  const folded = foldName(name)
  if (folded.trim() === '') return 'other'
  const match = FOLDED_KEYWORDS.find(({ keyword }) => folded.includes(` ${keyword} `))
  return match?.aisle ?? 'other'
}

export interface AisleGroup<T> {
  aisle: Aisle
  items: T[]
}

/** Regroupe les articles par rayon, dans l'ordre d'`AISLES`, sans rayon vide. */
export function groupByAisle<T extends Pick<ShoppingItem, 'name'>>(items: readonly T[]): AisleGroup<T>[] {
  const buckets = new Map<Aisle, T[]>()
  for (const item of items) {
    const aisle = aisleOf(item.name)
    const bucket = buckets.get(aisle)
    if (bucket) bucket.push(item)
    else buckets.set(aisle, [item])
  }
  return AISLES
    .filter(aisle => buckets.has(aisle))
    .map(aisle => ({ aisle, items: buckets.get(aisle) ?? [] }))
}
