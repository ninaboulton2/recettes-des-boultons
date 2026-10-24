import type { SharedRecipe } from '#shared/schemas/sharing'
import type { Recipe, RecipeSection } from '#shared/types'
import type { UnitCode } from '#shared/schemas/units'
import { unitCodeSchema } from '#shared/schemas/units'
import type { TranslationContent } from '#shared/utils/translation'

/**
 * Réponse de `get_shared_recipe` (page publique, sans compte) → `Recipe` de l'application, pour réutiliser la fiche, les portions
 * et le mode cuisine. La réponse ne contient aucun identifiant : les identifiants des sections, ingrédients et étapes sont fabriqués
 * ici (position), et `id` n'est qu'une clé locale (jamais envoyée à la base).
 */
export function sharedToRecipe(shared: SharedRecipe, id: string): Recipe {
  const sections: RecipeSection[] = shared.sections.map((section, i) => {
    const sectionId = `${id}:s${i}`
    return {
      id: sectionId,
      recipeId: id,
      name: section.name,
      type: section.type,
      orderIndex: section.order_index,
      createdAt: null,
      updatedAt: null,
      ingredients: section.ingredients.map((ingredient, j) => {
        const unitCode = unitCodeSchema.safeParse(ingredient.unit_code)
        return {
          id: `${sectionId}:i${j}`,
          sectionId,
          name: ingredient.name,
          amount: ingredient.amount,
          amountNum: ingredient.amount_num,
          unit: ingredient.unit,
          unitCode: (unitCode.success ? unitCode.data : null) as UnitCode | null,
          optional: ingredient.optional,
          orderIndex: j
        }
      }),
      instructions: section.instructions.map((content, k) => ({ id: `${sectionId}:n${k}`, sectionId, content, orderIndex: k }))
    }
  })
  const translation = shared.translation
  return {
    id,
    title: shared.title,
    description: shared.description ?? '',
    category: shared.category,
    prepTime: shared.prep_time,
    cookTime: shared.cook_time,
    servings: shared.servings,
    photoPath: null,
    tags: shared.tags,
    notes: shared.notes ?? '',
    createdAt: null,
    updatedAt: null,
    lang: shared.lang,
    translation: translation
      ? {
          locale: translation.locale,
          title: translation.title,
          description: translation.description,
          notes: translation.notes,
          tags: translation.tags,
          content: translation.content as unknown as TranslationContent,
          sourceHash: '',
          model: null,
          translatedAt: null
        }
      : null,
    sections
  }
}
