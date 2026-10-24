import type { Tables } from '../types/database'
import { CATEGORY_ICON_CHOICES, DEFAULT_CATEGORY_ICON, MAX_CATEGORIES, type CategoryIcon } from '../schemas/categories'
import { HEX_COLOR_PATTERN } from '../themes/schema'

/** Ligne de la table `categories`. */
export type CategoryRow = Tables<'categories'>

/** Catégorie personnelle prête à l'affichage (valeurs de la base assainies). */
export interface MyCategory {
  id: string
  slug: string
  nameFr: string | null
  nameEn: string | null
  icon: CategoryIcon
  /** `#rrggbb` ou `null` : jamais une autre valeur. */
  color: string | null
  sortOrder: number
}

const isIcon = (value: unknown): value is CategoryIcon => typeof value === 'string' && (CATEGORY_ICON_CHOICES as readonly string[]).includes(value)

/** Lecture défensive : une icône ou une couleur inattendue en base (texte libre) est remplacée, jamais rendue telle quelle. */
export function toMyCategory(row: CategoryRow): MyCategory {
  return {
    id: row.id,
    slug: row.slug,
    nameFr: row.name_fr ?? null,
    nameEn: row.name_en ?? null,
    icon: isIcon(row.icon) ? row.icon : DEFAULT_CATEGORY_ICON,
    color: row.color && HEX_COLOR_PATTERN.test(row.color) ? row.color.toLowerCase() : null,
    sortOrder: row.sort_order
  }
}

/** Nom dans la langue demandée, avec repli sur l'autre langue (au moins un nom existe en base). */
export function categoryLabel(category: Pick<MyCategory, 'nameFr' | 'nameEn' | 'slug'>, locale: string): string {
  const preferred = locale === 'en' ? category.nameEn : category.nameFr
  return preferred ?? category.nameFr ?? category.nameEn ?? category.slug
}

/** Clé stable (`slug`) à partir d'un nom : minuscules sans accents, `a-z0-9_-`, 60 caractères au plus. */
export function slugifyCategory(name: string): string {
  const slug = name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 55)
  return slug || 'categorie'
}

/** Premier slug libre : `base`, `base_2`, `base_3`… */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}_${n}`
    if (!taken.has(candidate)) return candidate
  }
  return `${base}_${Date.now().toString(36)}`
}

/** Ordre d'affichage : `sort_order`, puis nom (stable). */
export function sortCategories<T extends Pick<MyCategory, 'sortOrder' | 'nameFr' | 'nameEn' | 'slug'>>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder || categoryLabel(a, 'fr').localeCompare(categoryLabel(b, 'fr'), 'fr'))
}

export const canAddCategory = (count: number) => count < MAX_CATEGORIES

/**
 * Catégories suggérées (liste de départ du dossier §2.3) : mêmes clés, noms et icônes que `v2/0018` pour les comptes
 * existants, ordre de `RECIPE_CATEGORIES`. Ajoutées à la demande (réglages) ou à la fin de l'accueil.
 */
export interface SuggestedCategory { slug: string, nameFr: string, nameEn: string, icon: CategoryIcon }
export const SUGGESTED_CATEGORIES: readonly SuggestedCategory[] = [
  { slug: 'soupes', nameFr: 'Soupes', nameEn: 'Soups', icon: 'i-lucide-soup' },
  { slug: 'entrees', nameFr: 'Entrées, Salades, Pains et accompagnements', nameEn: 'Starters, Salads, Breads and sides', icon: 'i-lucide-salad' },
  { slug: 'plats', nameFr: 'Plats', nameEn: 'Main dishes', icon: 'i-lucide-utensils' },
  { slug: 'poissons', nameFr: 'Poissons', nameEn: 'Fish', icon: 'i-lucide-fish' },
  { slug: 'viandes', nameFr: 'Viandes', nameEn: 'Meat', icon: 'i-lucide-beef' },
  { slug: 'yaourts_et_fromages', nameFr: 'Yaourts et fromages', nameEn: 'Yogurts and cheeses', icon: 'i-lucide-milk' },
  { slug: 'desserts_et_gateaux', nameFr: 'Desserts et gâteaux', nameEn: 'Desserts and cakes', icon: 'i-lucide-cake-slice' },
  { slug: 'boissons', nameFr: 'Boissons', nameEn: 'Beverages', icon: 'i-lucide-cup-soda' },
  { slug: 'confitures', nameFr: 'Confitures', nameEn: 'Jams', icon: 'i-lucide-cherry' }
]
