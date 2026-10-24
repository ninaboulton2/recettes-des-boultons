import { describe, expect, it } from 'vitest'
import {
  addToCookbookInputSchema,
  authorRecipesQuerySchema,
  cookbookListQuerySchema,
  copyRecipeInputSchema,
  dismissPromptInputSchema,
  pageToRange,
  pendingPromptsQuerySchema,
  sharedWithMeQuerySchema
} from '#shared/schemas/cookbook'
import {
  claimSharedRecipeInputSchema,
  getSharedRecipeInputSchema,
  grantRecipeInputSchema,
  recipeShareInputSchema,
  reshareRecipeInputSchema,
  revokeRecipeGrantInputSchema,
  setVisibilityInputSchema,
  sharedRecipeSchema
} from '#shared/schemas/sharing'
import { recipeInputSchema, toSaveRecipePayload } from '#shared/schemas/recipe'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'

describe('listes du carnet (cookbook.ts)', () => {
  it('cookbookListQuerySchema : valeurs par défaut, catégorie uuid, borne de page', () => {
    expect(cookbookListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 24 })
    expect(cookbookListQuerySchema.parse({ categoryId: A, query: '  tarte ', page: '2', pageSize: '10' }))
      .toEqual({ categoryId: A, query: 'tarte', page: 2, pageSize: 10 })
    expect(cookbookListQuerySchema.safeParse({ categoryId: 'x' }).success).toBe(false)
    expect(cookbookListQuerySchema.safeParse({ page: 0 }).success).toBe(false)
    expect(cookbookListQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false)
    expect(cookbookListQuerySchema.safeParse({ query: 'x'.repeat(201) }).success).toBe(false)
  })

  it('authorRecipesQuerySchema exige un auteur uuid ; sharedWithMeQuerySchema a des défauts', () => {
    expect(authorRecipesQuerySchema.safeParse({}).success).toBe(false)
    expect(authorRecipesQuerySchema.parse({ authorId: A })).toEqual({ authorId: A, page: 1, pageSize: 24 })
    expect(sharedWithMeQuerySchema.parse({})).toEqual({ page: 1, pageSize: 24 })
  })

  it('pageToRange convertit une page en limite / décalage', () => {
    expect(pageToRange(1, 24)).toEqual({ limit: 24, offset: 0 })
    expect(pageToRange(3, 10)).toEqual({ limit: 10, offset: 20 })
  })

  it('addToCookbookInputSchema : recette uuid, catégorie facultative ; copyRecipeInputSchema', () => {
    expect(addToCookbookInputSchema.safeParse({ recipeId: A }).success).toBe(true)
    expect(addToCookbookInputSchema.safeParse({ recipeId: A, categoryId: null }).success).toBe(true)
    expect(addToCookbookInputSchema.safeParse({ recipeId: A, categoryId: 'pas-un-uuid' }).success).toBe(false)
    expect(addToCookbookInputSchema.safeParse({}).success).toBe(false)
    expect(copyRecipeInputSchema.safeParse({ recipeId: A, userId: 'ignoré' }).success).toBe(true)
    expect(copyRecipeInputSchema.safeParse({ recipeId: 3 }).success).toBe(false)
  })

  it('bannières : genre connu, date ISO, limite', () => {
    expect(dismissPromptInputSchema.safeParse({ kind: 'new_recipe', targetId: A }).success).toBe(true)
    expect(dismissPromptInputSchema.safeParse({ kind: 'author_recipes', targetId: A }).success).toBe(true)
    expect(dismissPromptInputSchema.safeParse({ kind: 'autre', targetId: A }).success).toBe(false)
    expect(pendingPromptsQuerySchema.parse({})).toEqual({ limit: 20 })
    expect(pendingPromptsQuerySchema.safeParse({ since: '2026-10-24T10:00:00Z' }).success).toBe(true)
    expect(pendingPromptsQuerySchema.safeParse({ since: 'hier' }).success).toBe(false)
    expect(pendingPromptsQuerySchema.safeParse({ limit: 0 }).success).toBe(false)
  })
})

describe('droits et repartage (sharing.ts)', () => {
  it('grantRecipeInputSchema : une personne OU un groupe, copy par défaut, edit_original permis', () => {
    expect(grantRecipeInputSchema.parse({ recipeId: A, granteeUserId: B })).toEqual({ recipeId: A, granteeUserId: B, permission: 'copy' })
    expect(grantRecipeInputSchema.safeParse({ recipeId: A, granteeGroupId: C, permission: 'edit_original' }).success).toBe(true)
    expect(grantRecipeInputSchema.safeParse({ recipeId: A }).success).toBe(false)
    expect(grantRecipeInputSchema.safeParse({ recipeId: A, granteeUserId: B, granteeGroupId: C }).success).toBe(false)
    expect(grantRecipeInputSchema.safeParse({ recipeId: A, granteeUserId: B, permission: 'admin' }).success).toBe(false)
  })

  it('reshareRecipeInputSchema : JAMAIS edit_original, read par défaut', () => {
    expect(reshareRecipeInputSchema.parse({ recipeId: A, granteeUserId: B })).toEqual({ recipeId: A, granteeUserId: B, permission: 'read' })
    expect(reshareRecipeInputSchema.safeParse({ recipeId: A, granteeUserId: B, permission: 'copy' }).success).toBe(true)
    const refused = reshareRecipeInputSchema.safeParse({ recipeId: A, granteeUserId: B, permission: 'edit_original' })
    expect(refused.success).toBe(false)
    if (!refused.success) expect(refused.error.issues[0]?.message).toContain('jamais edit_original')
    expect(reshareRecipeInputSchema.safeParse({ recipeId: A, permission: 'read' }).success).toBe(false)
  })

  it('identifiants requis (revoke, lien, usage, visibilité, jeton)', () => {
    expect(revokeRecipeGrantInputSchema.safeParse({ grantId: A }).success).toBe(true)
    expect(revokeRecipeGrantInputSchema.safeParse({ grantId: '' }).success).toBe(false)
    expect(recipeShareInputSchema.safeParse({ recipeId: A }).success).toBe(true)
    expect(recipeShareInputSchema.safeParse({}).success).toBe(false)
    expect(setVisibilityInputSchema.safeParse({ recipeId: A, visibility: 'private' }).success).toBe(true)
    expect(setVisibilityInputSchema.safeParse({ recipeId: A, visibility: 'public' }).success).toBe(false)
    expect(claimSharedRecipeInputSchema.safeParse({ token: A }).success).toBe(true)
    expect(claimSharedRecipeInputSchema.safeParse({ token: 'abc' }).success).toBe(false)
    expect(getSharedRecipeInputSchema.safeParse({ token: A, locale: 'en' }).success).toBe(true)
    expect(getSharedRecipeInputSchema.safeParse({ token: A, locale: null }).success).toBe(true)
    expect(getSharedRecipeInputSchema.safeParse({ token: A, locale: 'de' }).success).toBe(false)
  })
})

describe('sharedRecipeSchema (réponse de get_shared_recipe)', () => {
  const valid = {
    title: 'Tarte', description: null, category: 'desserts', prep_time: 10, cook_time: null, servings: 6, tags: ['fruit'],
    notes: null, lang: 'fr', has_photo: false, author_name: 'Nina',
    sections: [{
      name: 'Pâte', type: 'ingredients', order_index: 0,
      ingredients: [{ name: 'farine', amount: '250', amount_num: 250, unit: 'g', unit_code: 'g', optional: false }],
      instructions: ['Étaler.']
    }],
    translation: null
  }

  it('accepte la forme documentée', () => {
    expect(sharedRecipeSchema.safeParse(valid).success).toBe(true)
    expect(sharedRecipeSchema.safeParse({ ...valid, author_name: null }).success).toBe(true)
  })

  it('REFUSE toute clé identifiante en trop (strict)', () => {
    expect(sharedRecipeSchema.safeParse({ ...valid, owner_id: A }).success).toBe(false)
    expect(sharedRecipeSchema.safeParse({ ...valid, id: A }).success).toBe(false)
    expect(sharedRecipeSchema.safeParse({ ...valid, photo_path: `${A}/photo.webp` }).success).toBe(false)
    expect(sharedRecipeSchema.safeParse({ ...valid, email: 'a@b.fr' }).success).toBe(false)
    expect(sharedRecipeSchema.safeParse({ ...valid, sections: [{ ...valid.sections[0], recipe_id: A }] }).success).toBe(false)
  })
})

describe('recipeInputSchema / toSaveRecipePayload : clés v2 facultatives (0021)', () => {
  const base = { title: 'Tarte', category: 'desserts et gâteaux' }

  it('sans visibility ni categoryId : le payload est celui de la v1 (aucune clé en plus)', () => {
    const payload = toSaveRecipePayload(recipeInputSchema.parse(base))
    expect(payload).not.toHaveProperty('visibility')
    expect(payload).not.toHaveProperty('category_id')
  })

  it('visibility et categoryId sont transmis (null = retirer la catégorie)', () => {
    const payload = toSaveRecipePayload(recipeInputSchema.parse({ ...base, visibility: 'private', categoryId: A }))
    expect(payload.visibility).toBe('private')
    expect(payload.category_id).toBe(A)
    expect(toSaveRecipePayload(recipeInputSchema.parse({ ...base, categoryId: null })).category_id).toBeNull()
    expect(recipeInputSchema.safeParse({ ...base, visibility: 'public' }).success).toBe(false)
    expect(recipeInputSchema.safeParse({ ...base, categoryId: 'x' }).success).toBe(false)
  })
})
