// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { toSaveRecipePayload, recipeInputSchema } from '#shared/schemas/recipe'

/**
 * Test d'intégration contre la stack Supabase LOCALE (`npm run db:local:up`).
 * Sauté automatiquement si `.env.local` est absent ou si l'API n'est pas joignable.
 * Toutes les données créées portent le préfixe `TEST_2B_` et sont supprimées à la fin.
 */

const PREFIX = 'TEST_2B_'
const ADMIN = { email: 'admin@local.test', password: 'password123' }
const USER = { email: 'user@local.test', password: 'password123' }

function readLocalEnv(): { url: string, key: string } | null {
  try {
    const raw = readFileSync(resolve(__dirname, '../../.env.local'), 'utf8')
    const env = new Map<string, string>()
    for (const line of raw.split('\n')) {
      const match = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(line)
      if (match) env.set(match[1] as string, (match[2] as string).replace(/^['"]|['"]$/g, ''))
    }
    const url = env.get('SUPABASE_URL')
    const key = env.get('SUPABASE_ANON_KEY')
    if (!url || !key || !/127\.0\.0\.1|localhost/.test(url)) return null
    return { url, key }
  } catch {
    return null
  }
}

async function isReachable(url: string, key: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/rest/v1/`, { headers: { apikey: key }, signal: AbortSignal.timeout(3000) })
    return response.status < 500
  } catch {
    return false
  }
}

const env = readLocalEnv()
const reachable = env ? await isReachable(env.url, env.key) : false

interface IngredientRow { name: string, amount: string | null, amount_num: number | null, unit: string | null, unit_code: string | null, order_index: number, section_id: string }
interface SectionRow { id: string, name: string, order_index: number }

describe.skipIf(!reachable)('save_recipe / delete_recipe / merge_shopping_item (base locale)', () => {
  let admin: SupabaseClient
  let user: SupabaseClient
  let recipeId: string | null = null
  let listId: string | null = null

  const login = async (credentials: { email: string, password: string }) => {
    const client = createClient(env!.url, env!.key, { auth: { persistSession: false, autoRefreshToken: false } })
    const { error } = await client.auth.signInWithPassword(credentials)
    if (error) throw error
    return client
  }

  beforeAll(async () => {
    admin = await login(ADMIN)
    user = await login(USER)
  })

  afterAll(async () => {
    if (admin) {
      const { data: leftovers } = await admin.from('recipes').select('id').like('title', `${PREFIX}%`)
      for (const row of (leftovers ?? []) as Array<{ id: string }>) {
        await admin.rpc('delete_recipe', { p_id: row.id })
      }
      await admin.from('shopping_lists').delete().like('name', `${PREFIX}%`)
      await admin.auth.signOut()
    }
    if (user) await user.auth.signOut()
  })

  const input = recipeInputSchema.parse({
    title: `${PREFIX}Gâteau ${Date.now()}`,
    category: 'desserts et gâteaux',
    prepTime: 10,
    cookTime: null,
    servings: 4,
    tags: ['test'],
    sections: [
      {
        name: 'Pâte', type: 'ingredients', orderIndex: 0,
        ingredients: [
          { name: 'Farine', amount: '200', unit: 'g', orderIndex: 0 },
          { name: 'Sucre', amount: '1/2', unit: 'tasse', orderIndex: 1 },
          { name: 'Œufs', amount: 2, unit: '', orderIndex: 2 }
        ]
      },
      {
        name: 'Préparation', type: 'instructions', orderIndex: 1,
        instructions: [{ content: 'Mélanger.', orderIndex: 0 }, { content: 'Cuire.', orderIndex: 1 }]
      }
    ]
  })

  it('crée la recette : unit_code / amount_num remplis, JSONB legacy recalculé', async () => {
    const { data, error } = await admin.rpc('save_recipe', { payload: toSaveRecipePayload(input) })
    expect(error).toBeNull()
    expect(typeof data).toBe('string')
    recipeId = data as string

    const { data: sections } = await admin.from('recipe_sections').select('id, name, order_index').eq('recipe_id', recipeId).order('order_index')
    expect((sections as SectionRow[]).map(s => s.name)).toEqual(['Pâte', 'Préparation'])

    const { data: ingredients } = await admin.from('recipe_ingredients')
      .select('name, amount, amount_num, unit, unit_code, order_index, section_id').eq('recipe_id', recipeId).order('order_index')
    const rows = ingredients as IngredientRow[]
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({ name: 'Farine', unit_code: 'g', amount_num: 200 })
    expect(rows[1]).toMatchObject({ name: 'Sucre', unit_code: 'tasse', amount_num: 0.5 })
    expect(rows[2]).toMatchObject({ name: 'Œufs', unit_code: null, amount_num: 2 })

    const { data: instructions } = await admin.from('instructions').select('content').eq('recipe_id', recipeId)
    expect(instructions).toHaveLength(2)

    const { data: recipe } = await admin.from('recipes').select('ingredients, instructions').eq('id', recipeId).single()
    const legacy = recipe as { ingredients: Array<{ name: string, amount: unknown }>, instructions: string[] }
    expect(legacy.ingredients.map(i => i.name)).toEqual(['Farine', 'Sucre', 'Œufs'])
    expect(legacy.ingredients[0]?.amount).toBe(200)
    expect(legacy.instructions).toEqual(['Mélanger.', 'Cuire.'])
  })

  it('met à jour (sections réordonnées) sans créer de doublon', async () => {
    expect(recipeId).not.toBeNull()
    const reordered = recipeInputSchema.parse({
      ...input,
      sections: [
        { ...input.sections![1], orderIndex: 0 },
        { ...input.sections![0], orderIndex: 1 }
      ]
    })
    const { data, error } = await admin.rpc('save_recipe', { payload: toSaveRecipePayload(reordered, recipeId!) })
    expect(error).toBeNull()
    expect(data).toBe(recipeId)

    const { data: sections } = await admin.from('recipe_sections').select('id, name, order_index').eq('recipe_id', recipeId!).order('order_index')
    expect((sections as SectionRow[]).map(s => s.name)).toEqual(['Préparation', 'Pâte'])
    const { count: ingredientCount } = await admin.from('recipe_ingredients').select('id', { count: 'exact', head: true }).eq('recipe_id', recipeId!)
    expect(ingredientCount).toBe(3)
    const { count: instructionCount } = await admin.from('instructions').select('id', { count: 'exact', head: true }).eq('recipe_id', recipeId!)
    expect(instructionCount).toBe(2)
  })

  it('refuse save_recipe à un utilisateur non admin (42501)', async () => {
    const { error } = await user.rpc('save_recipe', { payload: toSaveRecipePayload({ ...input, title: `${PREFIX}interdit` }) })
    expect(error?.code).toBe('42501')
  })

  it('fusionne « Farine 100 g » ajoutée deux fois en une ligne 200 g', async () => {
    const { data: me } = await admin.auth.getUser()
    const { data: list, error: listError } = await admin.from('shopping_lists')
      .insert({ name: `${PREFIX}liste`, user_id: me.user?.id })
      .select('id')
      .single()
    expect(listError).toBeNull()
    listId = (list as { id: string }).id

    for (let i = 0; i < 2; i++) {
      const { error } = await admin.rpc('merge_shopping_item', { p_list_id: listId, p_name: i === 0 ? 'Farine' : 'farine', p_amount_num: 100, p_unit_code: 'g', p_recipe_id: null })
      expect(error).toBeNull()
    }
    const { data: items } = await admin.from('shopping_items').select('name, amount, amount_num, unit_code').eq('list_id', listId)
    expect(items).toHaveLength(1)
    expect(items?.[0]).toMatchObject({ amount_num: 200, unit_code: 'g', amount: '200' })
  })

  it('ajoute la recette à la liste (add_recipe_to_list) et fusionne la farine', async () => {
    const { data, error } = await admin.rpc('add_recipe_to_list', { p_recipe_id: recipeId, p_list_id: listId, p_section_ids: null, p_servings_factor: 1 })
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    const { data: farine } = await admin.from('shopping_items').select('amount_num').eq('list_id', listId!).ilike('name', 'farine')
    expect(farine).toHaveLength(1)
    expect((farine?.[0] as { amount_num: number }).amount_num).toBe(400)
  })

  it('supprime la recette (delete_recipe) et ses enfants', async () => {
    const { error } = await admin.rpc('delete_recipe', { p_id: recipeId })
    expect(error).toBeNull()
    const { data } = await admin.from('recipes').select('id').eq('id', recipeId!).maybeSingle()
    expect(data).toBeNull()
    const { count } = await admin.from('recipe_ingredients').select('id', { count: 'exact', head: true }).eq('recipe_id', recipeId!)
    expect(count).toBe(0)

    const { error: again } = await admin.rpc('delete_recipe', { p_id: recipeId })
    expect(again?.code).toBe('P0002')
    recipeId = null
  })
})
