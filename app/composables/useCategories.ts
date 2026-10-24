import { RECIPE_CATEGORIES, type RecipeCategory } from '#shared/types'
import { categoryLabel } from '#shared/utils/categories'
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
  /** v1 : l'ancien texte de la catégorie ; v2 : l'identifiant de MA catégorie. */
  id: string
  name: string
  description: string
  icon: string
  visual: CategoryVisual
  /** v2 : couleur choisie (`#rrggbb`), `null` sinon. */
  color?: string | null
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

/**
 * Catégories traduites + accès au libellé et au visuel d'une catégorie quelconque.
 *
 * - v1 : les 9 catégories fixes (`RECIPE_CATEGORIES`), identifiées par leur ancien texte.
 * - v2 : MES catégories (`useCategoriesStore`), identifiées par leur identifiant. Les fonctions acceptent aussi la clé
 *   (`slug`) ou l'ancien texte de la v1, qui traînent encore dans les URL et les recettes d'avant la bascule.
 */
export function useCategories() {
  const { t, te, locale } = useI18n()
  const edition = useEdition()
  const store = useV2() ? useCategoriesStore() : null

  /** Catégorie personnelle (v2) à partir d'un identifiant, d'une clé ou d'un ancien texte. */
  const mine = (id: string | null | undefined) => {
    if (!store || !id) return undefined
    const resolved = store.resolveId(id)
    return resolved ? store.byId.get(resolved) : undefined
  }

  /** Illustration de l'édition si elle en fournit une, sinon icône Lucide. */
  const categoryVisual = (id: string | null | undefined): CategoryVisual => {
    const own = mine(id)
    const images = edition.config.categoryImages as Record<string, string> | null
    if (own) {
      // Édition à illustrations (Boultons) : l'image de la catégorie d'origine de même clé, sinon l'icône choisie.
      const legacy = images ? Object.keys(images).find(key => categoryKey(key) === own.slug) : undefined
      const src = legacy ? images?.[legacy] : undefined
      return src ? { type: 'image', src } : { type: 'icon', name: own.icon }
    }
    const src = id && images ? images[id] : undefined
    return src ? { type: 'image', src } : { type: 'icon', name: categoryIcon(id) }
  }

  const categoryName = (id: string): string => {
    const own = mine(id)
    if (own) return categoryLabel(own, locale.value)
    const key = `categories.${categoryKey(id)}.name`
    return te(key) ? t(key) : id
  }

  const categories = computed<CategoryEntry[]>(() => {
    if (store) {
      return store.items.map((own) => {
        const key = `categories.${own.slug}.description`
        return {
          id: own.id,
          name: categoryLabel(own, locale.value),
          description: te(key) ? t(key) : '',
          icon: own.icon,
          visual: categoryVisual(own.id),
          color: own.color
        }
      })
    }
    return RECIPE_CATEGORIES.map(id => ({
      id,
      name: categoryName(id),
      description: t(`categories.${categoryKey(id)}.description`),
      icon: CATEGORY_ICONS[id],
      visual: categoryVisual(id)
    }))
  })

  return { categories, categoryName, categoryIcon, categoryVisual }
}
