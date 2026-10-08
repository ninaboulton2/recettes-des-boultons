import { RECIPE_CATEGORIES, type RecipeCategory } from '#shared/types'
import { normalizeAccents } from '#shared/utils/text'

/**
 * Visuel d'une catégorie selon l'édition : illustration (PNG de `public/`)
 * ou icône Lucide. Repli des recettes sans photo (la photo reste prioritaire).
 */
export type CategoryVisual =
  | { type: 'image', src: string }
  | { type: 'icon', name: string }

/** Catégorie prête à l'affichage (libellés i18n, icône Lucide, visuel d'édition). */
export interface CategoryEntry {
  id: RecipeCategory
  name: string
  description: string
  icon: string
  visual: CategoryVisual
}

/** Icône Lucide sobre par catégorie (repli quand une recette n'a pas de photo). */
export const CATEGORY_ICONS: Record<RecipeCategory, string> = {
  'soupes': 'i-lucide-soup',
  'entrees': 'i-lucide-salad',
  'plats': 'i-lucide-utensils',
  'poissons': 'i-lucide-fish',
  'viandes': 'i-lucide-beef',
  'yaourts et fromages': 'i-lucide-milk',
  'desserts et gâteaux': 'i-lucide-cake-slice',
  'boissons': 'i-lucide-cup-soda',
  'confitures': 'i-lucide-cherry'
}

/** Clé i18n d'une catégorie : « desserts et gâteaux » → `desserts_et_gateaux`. */
export function categoryKey(id: string): string {
  return normalizeAccents(id).trim().replace(/\s+/g, '_')
}

export function categoryIcon(id: string | null | undefined): string {
  return (id && (CATEGORY_ICONS as Record<string, string>)[id]) || 'i-lucide-chef-hat'
}

/** Catégories traduites + accès au libellé et au visuel d'une catégorie quelconque. */
export function useCategories() {
  const { t, te } = useI18n()
  const { config } = useEdition()

  /** Illustration de l'édition si elle en fournit une, sinon icône Lucide. */
  const categoryVisual = (id: string | null | undefined): CategoryVisual => {
    const src = id && config.categoryImages ? (config.categoryImages as Record<string, string>)[id] : undefined
    return src ? { type: 'image', src } : { type: 'icon', name: categoryIcon(id) }
  }

  const categoryName = (id: string): string => {
    const key = `categories.${categoryKey(id)}.name`
    return te(key) ? t(key) : id
  }

  const categories = computed<CategoryEntry[]>(() =>
    RECIPE_CATEGORIES.map(id => ({
      id,
      name: categoryName(id),
      description: t(`categories.${categoryKey(id)}.description`),
      icon: CATEGORY_ICONS[id],
      visual: categoryVisual(id)
    }))
  )

  return { categories, categoryName, categoryIcon, categoryVisual }
}
