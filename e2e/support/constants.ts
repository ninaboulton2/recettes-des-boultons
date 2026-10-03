/** RECIPES_PAGE_SIZE de app/composables/useRecipeSearch.ts. */
export const RECIPES_PER_PAGE = 24

/** Catégorie utilisée pour le filtre + pagination (identifiant et libellé FR). */
export const PAGINATION_CATEGORY = 'plats'
export const PAGINATION_CATEGORY_LABEL = 'Plats'

/**
 * Recette présente dans les deux jeux de données : « Gâteau au yaourt »
 * (seed_test.sql) et « Gâteau au yaourt aux … » (snapshot), avec de la farine.
 */
export const SEARCH_QUERY = 'gateau au yaourt'
export const SEARCH_TITLE = /^Gâteau au yaourt/
export const SEARCH_INGREDIENT = /farine/i
