// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { TranslateRecipeResponse } from '#shared/schemas/ai'
import type { RecipeInput } from '#shared/schemas/recipe'
import { recipeTexts, sourceHash, type TranslatableRecipe } from '#shared/utils/translation'
import { toRecipe, type RecipeWithSectionsRow } from '#shared/utils/recipes'
import { MOCK_FAILURE_MARKER } from '../../server/utils/ai/mock'

/**
 * Recettes bilingues (0016) contre la stack Supabase LOCALE et le serveur Nuxt
 * de dev lancé avec `AI_PROVIDER=mock` (aucun appel payant) :
 *   npx nuxt dev --dotenv .env.local --port 3048
 *   APP_URL=http://localhost:3048 npm test
 * Sauté automatiquement si `.env.local`, l'API Supabase ou le serveur sont absents.
 * Données créées : préfixe `TEST_BI_`, supprimées à la fin. Le fournisseur
 * simulé préfixe les traductions de « [EN] » / « [FR] ».
 */

const PREFIX = 'TEST_BI_'
const APP_URL = process.env.APP_URL ?? 'http://localhost:3001'
const ADMIN = { email: 'admin2@local.test', password: 'password123' }
const USER = { email: 'user2@local.test', password: 'password123' }

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

async function isReachable(url: string, init: RequestInit = {}): Promise<boolean> {
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(5000) })
    return response.status < 500
  } catch {
    return false
  }
}

const env = readLocalEnv()
const supabaseUp = env ? await isReachable(`${env.url}/rest/v1/`, { headers: { apikey: env.key } }) : false
const appUp = supabaseUp && await isReachable(`${APP_URL}/`)

const FRENCH_TEXT = `${PREFIX}Gâteau au yaourt\n\nMélanger la farine avec le sucre et les œufs, puis cuire au four.`
const ENGLISH_TEXT = `${PREFIX}Chocolate chip cookies\n\n2 cups flour and 1 cup butter. Mix the flour with the butter and bake until golden.`

const SELECT = 'id, title, description, category, prep_time, cook_time, servings, photo_path, tags, notes, created_at, updated_at, lang, '
  + 'recipe_translations(*), recipe_sections(*, recipe_ingredients(*), instructions(*))'

interface MutationResponse {
  success: boolean
  recipe: { id: string, title: string }
  translation: { status: string, lang?: string, reason?: string, message?: string }
}

describe.skipIf(!appUp)('recettes bilingues (mock + base locale)', () => {
  let admin: SupabaseClient
  let user: SupabaseClient
  let anon: SupabaseClient
  let adminToken = ''
  let userToken = ''
  let adminId = ''
  const created: string[] = []

  const login = async (credentials: { email: string, password: string }) => {
    const client = createClient(env!.url, env!.key, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await client.auth.signInWithPassword(credentials)
    if (error) throw error
    return { client, token: data.session?.access_token ?? '', id: data.user?.id ?? '' }
  }

  const call = (token: string, path: string, method: string, body?: unknown) => fetch(`${APP_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  })

  const usageCount = async (feature: string) => {
    const { count } = await admin.from('ai_usage').select('id', { count: 'exact', head: true }).eq('user_id', adminId).eq('feature', feature)
    return count ?? 0
  }

  const loadRecipe = async (id: string) => {
    const { data, error } = await admin.from('recipes').select(SELECT).eq('id', id).single()
    if (error) throw error
    return toRecipe(data as unknown as RecipeWithSectionsRow)
  }

  const translationRows = async (id: string) => {
    const { data, error } = await admin.from('recipe_translations').select('*').eq('recipe_id', id)
    if (error) throw error
    return (data ?? []) as Array<{ locale: string, title: string, description: string | null, source_hash: string, stale: boolean, model: string | null, content: { sections: Array<{ name: string, ingredients: Array<{ name: string, amount: string | null }>, instructions: string[] }> } }>
  }

  /** Importe un texte (IA simulée) puis l'enregistre avec ses deux langues. */
  const importRecipe = async (text: string) => {
    const translated = await call(adminToken, '/api/translate-recipe', 'POST', { recipeText: text })
    expect(translated.status).toBe(200)
    const data = (await translated.json()) as TranslateRecipeResponse
    const added = await call(adminToken, '/api/add-recipe', 'POST', { recipe: data.recipe, lang: data.lang, translation: data.translation })
    expect(added.status).toBe(200)
    const saved = (await added.json()) as MutationResponse
    created.push(saved.recipe.id)
    return { data, saved }
  }

  const baseInput = (title: string, overrides: Partial<RecipeInput> = {}): RecipeInput => ({
    title,
    category: 'desserts et gâteaux',
    description: 'Une recette de test.',
    servings: 4,
    tags: ['rapide'],
    sections: [
      { name: 'Pâte', type: 'ingredients', orderIndex: 0, ingredients: [
        { name: 'farine', amount: 250, unit: 'g', unitCode: 'g', orderIndex: 0 },
        { name: 'sel', amount: 'au goût', orderIndex: 1 }
      ] },
      { name: 'Préparation', type: 'instructions', orderIndex: 1, instructions: [{ content: 'Mélanger.', orderIndex: 0 }, { content: 'Cuire.', orderIndex: 1 }] }
    ],
    ...overrides
  })

  beforeAll(async () => {
    const a = await login(ADMIN)
    admin = a.client
    adminToken = a.token
    adminId = a.id
    const u = await login(USER)
    user = u.client
    userToken = u.token
    anon = createClient(env!.url, env!.key, { auth: { persistSession: false, autoRefreshToken: false } })
  })

  afterAll(async () => {
    if (admin) {
      const { data: leftovers } = await admin.from('recipes').select('id').like('title', `${PREFIX}%`)
      for (const row of (leftovers ?? []) as Array<{ id: string }>) {
        await admin.rpc('delete_recipe', { p_id: row.id })
      }
      await admin.auth.signOut({ scope: 'local' })
    }
    if (user) await user.auth.signOut({ scope: 'local' })
  })

  describe('import : les deux langues sont créées', () => {
    it('texte français → lang fr + traduction anglaise alignée, enregistrées ensemble sans appel IA supplémentaire', async () => {
      const before = await usageCount('translate_recipe')
      const { data, saved } = await importRecipe(FRENCH_TEXT)
      expect(data.lang).toBe('fr')
      expect(data.translation.title).toBe(`[EN] ${PREFIX}Gâteau au yaourt`)
      expect(saved.translation).toMatchObject({ status: 'provided', lang: 'fr' })
      expect(await usageCount('translate_recipe')).toBe(before)

      const recipe = await loadRecipe(saved.recipe.id)
      expect(recipe.lang).toBe('fr')
      const rows = await translationRows(saved.recipe.id)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ locale: 'en', stale: false, title: `[EN] ${PREFIX}Gâteau au yaourt` })
      expect(rows[0]!.content.sections[0]!.ingredients[0]).toMatchObject({ name: '[EN] farine' })
      // L'empreinte enregistrée est celle de la recette relue en base.
      expect(rows[0]!.source_hash).toBe(sourceHash(recipeTexts(recipe as TranslatableRecipe)))
    })

    it('texte anglais → lang en + traduction française', async () => {
      const { data, saved } = await importRecipe(ENGLISH_TEXT)
      expect(data.lang).toBe('en')
      expect(data.translation.title).toBe(`[FR] ${PREFIX}Chocolate chip cookies`)
      expect((await loadRecipe(saved.recipe.id)).lang).toBe('en')
      expect((await translationRows(saved.recipe.id))[0]).toMatchObject({ locale: 'fr', stale: false })
    })

    it('refuse une traduction incohérente avec la recette (400) et un non-admin (403)', async () => {
      const translated = await call(adminToken, '/api/translate-recipe', 'POST', { recipeText: FRENCH_TEXT })
      const data = (await translated.json()) as TranslateRecipeResponse
      const broken = structuredClone(data.translation)
      broken.content.sections.pop()
      const refused = await call(adminToken, '/api/add-recipe', 'POST', { recipe: data.recipe, lang: data.lang, translation: broken })
      expect(refused.status).toBe(400)
      expect(((await refused.json()) as { statusMessage?: string }).statusMessage).toContain('Traduction incohérente')
      expect((await call(userToken, '/api/add-recipe', 'POST', { recipe: data.recipe, lang: data.lang, translation: data.translation })).status).toBe(403)
    })

    it('le traducteur ne propose plus de langue cible (ancien client toléré)', async () => {
      const response = await call(adminToken, '/api/translate-recipe', 'POST', { recipeText: FRENCH_TEXT, targetLanguage: 'en' })
      expect(response.status).toBe(200)
      expect(((await response.json()) as TranslateRecipeResponse).lang).toBe('fr')
    })
  })

  describe('éditeur : création et modification', () => {
    it('création sans traduction → l\'IA traduit après l\'enregistrement (quota + ai_usage)', async () => {
      const before = await usageCount('translate_recipe')
      const response = await call(adminToken, '/api/add-recipe', 'POST', { recipe: baseInput(`${PREFIX}Création`) })
      expect(response.status).toBe(200)
      const saved = (await response.json()) as MutationResponse
      created.push(saved.recipe.id)
      expect(saved.translation).toMatchObject({ status: 'translated', lang: 'fr' })
      expect(await usageCount('translate_recipe')).toBe(before + 1)
      const rows = await translationRows(saved.recipe.id)
      expect(rows[0]).toMatchObject({ locale: 'en', stale: false, model: 'mock-recipe', title: `[EN] ${PREFIX}Création` })
      expect(rows[0]!.content.sections[0]!.ingredients[1]).toEqual({ name: '[EN] sel', amount: '[EN] au goût', unit: null })
    })

    it('modifier le texte source régénère la traduction ; la traduction survit au remplacement des sections', async () => {
      const created1 = await call(adminToken, '/api/add-recipe', 'POST', { recipe: baseInput(`${PREFIX}Édition`) })
      const { recipe } = (await created1.json()) as MutationResponse
      created.push(recipe.id)
      const before = await usageCount('translate_recipe')

      const edited = baseInput(`${PREFIX}Édition`)
      edited.sections![1]!.instructions = [{ content: 'Mélanger.', orderIndex: 0 }, { content: 'Cuire 40 minutes.', orderIndex: 1 }]
      const response = await call(adminToken, `/api/update-recipe?id=${recipe.id}`, 'PUT', { updates: edited })
      expect(response.status).toBe(200)
      expect(((await response.json()) as MutationResponse).translation).toMatchObject({ status: 'translated' })
      expect(await usageCount('translate_recipe')).toBe(before + 1)
      const rows = await translationRows(recipe.id)
      expect(rows[0]!.stale).toBe(false)
      expect(rows[0]!.content.sections[1]!.instructions).toEqual(['[EN] Mélanger.', '[EN] Cuire 40 minutes.'])
      expect(rows[0]!.source_hash).toBe(sourceHash(recipeTexts(await loadRecipe(recipe.id) as TranslatableRecipe)))
    })

    it('un enregistrement qui ne change pas le texte (temps, portions, quantité chiffrée) garde la traduction sans appel IA', async () => {
      const created1 = await call(adminToken, '/api/add-recipe', 'POST', { recipe: baseInput(`${PREFIX}Inchangé`) })
      const { recipe } = (await created1.json()) as MutationResponse
      created.push(recipe.id)
      const before = await usageCount('translate_recipe')
      const [row] = await translationRows(recipe.id)

      const edited = baseInput(`${PREFIX}Inchangé`, { prepTime: 20, cookTime: 35, servings: 8 })
      edited.sections![0]!.ingredients![0]!.amount = 300
      const response = await call(adminToken, `/api/update-recipe?id=${recipe.id}`, 'PUT', { updates: edited })
      expect(((await response.json()) as MutationResponse).translation.status).toBe('unchanged')
      expect(await usageCount('translate_recipe')).toBe(before)
      const [after] = await translationRows(recipe.id)
      expect(after).toMatchObject({ stale: false, source_hash: row!.source_hash })
      expect(after!.content).toEqual(row!.content)
    })

    it('si l\'IA échoue, l\'enregistrement réussit et la traduction est marquée périmée, puis corrigée en réenregistrant la recette', async () => {
      const created1 = await call(adminToken, '/api/add-recipe', 'POST', { recipe: baseInput(`${PREFIX}Panne`) })
      const { recipe } = (await created1.json()) as MutationResponse
      created.push(recipe.id)

      const failing = baseInput(`${PREFIX}Panne`)
      failing.sections![1]!.instructions = [{ content: `Cuire ${MOCK_FAILURE_MARKER}.`, orderIndex: 0 }]
      const response = await call(adminToken, `/api/update-recipe?id=${recipe.id}`, 'PUT', { updates: failing })
      expect(response.status).toBe(200)
      const body = (await response.json()) as MutationResponse
      expect(body.translation).toMatchObject({ status: 'failed', reason: 'ai' })
      expect(body.translation.message).toBeTruthy()
      // La recette est bien enregistrée avec le nouveau texte…
      expect((await loadRecipe(recipe.id)).sections[1]!.instructions[0]!.content).toContain(MOCK_FAILURE_MARKER)
      // … et la traduction est périmée : ignorée par les lectures.
      expect((await translationRows(recipe.id))[0]!.stale).toBe(true)
      const { data: found } = await anon.rpc('search_recipes', { p_query: `${PREFIX}Panne` })
      expect((found as Array<{ translation: unknown }>)[0]!.translation).toBeNull()
      expect((await loadRecipe(recipe.id)).translation).toBeNull()

      // Réenregistrer la recette (panne disparue) retraduit et rétablit la traduction.
      const fixed = baseInput(`${PREFIX}Panne`)
      await call(adminToken, `/api/update-recipe?id=${recipe.id}`, 'PUT', { updates: fixed })
      expect((await translationRows(recipe.id))[0]!.stale).toBe(false)
    })
  })

  describe('recherche dans les deux langues', () => {
    it('trouve une recette par son titre, ses ingrédients ou sa description, dans la langue d\'origine comme dans la traduction', async () => {
      const recipe = baseInput(`${PREFIX}Gâteau citron`, { description: 'Un gâteau frais et acidulé.' })
      const draft = {
        title: `${PREFIX}Lemon cake`,
        description: 'A fresh and tangy cake.',
        notes: null,
        tags: ['quick'],
        content: { sections: [
          { name: 'Dough', ingredients: [{ name: 'wheat flour', amount: null, unit: null }, { name: 'salt', amount: 'to taste', unit: null }], instructions: [] },
          { name: 'Method', ingredients: [], instructions: ['Mix.', 'Bake.'] }
        ] }
      }
      const added = await call(adminToken, '/api/add-recipe', 'POST', { recipe, lang: 'fr', translation: draft })
      const { recipe: saved } = (await added.json()) as MutationResponse
      created.push(saved.id)

      const search = async (query: string) => {
        const { data, error } = await anon.rpc('search_recipes', { p_query: query })
        if (error) throw error
        return (data as Array<{ id: string, title: string, lang: string, translation: { locale: string, title: string, tags: string[] } | null }>).filter(row => row.id === saved.id)
      }

      expect(await search('acidulé')).toHaveLength(1)           // description d'origine (français)
      expect(await search('gateau citron')).toHaveLength(1)     // titre d'origine, sans accents
      expect(await search('lemon')).toHaveLength(1)             // titre traduit
      expect(await search('tangy')).toHaveLength(1)             // description traduite
      expect(await search('flour')).toHaveLength(1)             // ingrédient traduit
      expect(await search('wheat flour')).toHaveLength(1)
      expect(await search('inconnu-xyz')).toHaveLength(0)
      const [hit] = await search('lemon')
      expect(hit).toMatchObject({ lang: 'fr', translation: { locale: 'en', title: `${PREFIX}Lemon cake`, tags: ['quick'] } })
    })

    it('une recette anglaise se cherche en anglais (stemming anglais) et par sa traduction française', async () => {
      const recipe = baseInput(`${PREFIX}Cookies`, { description: 'Crunchy cookies with chocolate chips.' })
      const draft = { title: `${PREFIX}Biscuits`, description: 'Biscuits croustillants.', notes: null, tags: ['rapide'],
        content: { sections: [
          { name: 'Pâte', ingredients: [{ name: 'farine', amount: null, unit: null }, { name: 'sel', amount: null, unit: null }], instructions: [] },
          { name: 'Étapes', ingredients: [], instructions: ['Mélanger.', 'Cuire.'] }
        ] } }
      const added = await call(adminToken, '/api/add-recipe', 'POST', { recipe, lang: 'en', translation: draft })
      const { recipe: saved } = (await added.json()) as MutationResponse
      created.push(saved.id)
      const found = async (query: string) => {
        const { data } = await anon.rpc('search_recipes', { p_query: query })
        return (data as Array<{ id: string }>).some(row => row.id === saved.id)
      }
      expect(await found('cookie')).toBe(true)        // « cookies » : même racine en anglais
      expect(await found('biscuit')).toBe(true)       // traduction française
      expect(await found('croustillants')).toBe(true)
    })
  })

  describe('sécurité (RLS)', () => {
    it('un utilisateur ou un visiteur ne peut ni écrire ni modifier ni supprimer une traduction ; tout le monde peut les lire', async () => {
      const created1 = await call(adminToken, '/api/add-recipe', 'POST', { recipe: baseInput(`${PREFIX}Droits`) })
      const { recipe } = (await created1.json()) as MutationResponse
      created.push(recipe.id)
      const draft = { title: 'Hack', description: null, notes: null, tags: [], source_hash: 'x', model: null, content: { sections: [] } }

      const rpc = await user.rpc('save_recipe_translation', { p_recipe_id: recipe.id, p_lang: 'fr', p_translation: draft })
      expect(rpc.error?.code).toBe('42501')
      const insert = await user.from('recipe_translations').insert({ recipe_id: recipe.id, locale: 'fr', title: 'Hack', source_hash: 'x' })
      expect(insert.error?.code).toBe('42501')
      const update = await user.from('recipe_translations').update({ title: 'Hack' }).eq('recipe_id', recipe.id).select()
      expect(update.data ?? []).toHaveLength(0)
      const del = await user.from('recipe_translations').delete().eq('recipe_id', recipe.id).select()
      expect(del.data ?? []).toHaveLength(0)
      const anonRpc = await anon.rpc('save_recipe_translation', { p_recipe_id: recipe.id, p_lang: 'fr', p_translation: draft })
      expect(anonRpc.error).not.toBeNull()
      const anonInsert = await anon.from('recipe_translations').insert({ recipe_id: recipe.id, locale: 'fr', title: 'Hack', source_hash: 'x' })
      expect(anonInsert.error).not.toBeNull()

      // La traduction n'a pas bougé…
      expect((await translationRows(recipe.id))[0]!.title).toBe(`[EN] ${PREFIX}Droits`)
      // … et reste lisible publiquement.
      const read = await anon.from('recipe_translations').select('title').eq('recipe_id', recipe.id)
      expect(read.data).toEqual([{ title: `[EN] ${PREFIX}Droits` }])
      // Un utilisateur ne peut pas non plus fixer la langue d'une recette.
      const lang = await user.from('recipes').update({ lang: 'en' }).eq('id', recipe.id).select()
      expect(lang.data ?? []).toHaveLength(0)
    })
  })

  describe('courses : noms dans la langue de l\'interface', () => {
    it('add_recipe_to_list avec locale en ajoute les noms traduits, sans locale les noms d\'origine', async () => {
      const draft = { title: `${PREFIX}Courses EN`, description: null, notes: null, tags: [],
        content: { sections: [
          { name: 'Dough', ingredients: [{ name: 'flour', amount: null, unit: null }, { name: 'salt', amount: 'to taste', unit: null }], instructions: [] },
          { name: 'Method', ingredients: [], instructions: ['Mix.', 'Bake.'] }
        ] } }
      const added = await call(adminToken, '/api/add-recipe', 'POST', { recipe: baseInput(`${PREFIX}Courses`), lang: 'fr', translation: draft })
      const { recipe } = (await added.json()) as MutationResponse
      created.push(recipe.id)

      const { data: list, error } = await user.from('shopping_lists').insert({ name: `${PREFIX}liste`, user_id: (await user.auth.getUser()).data.user!.id }).select('id').single()
      if (error) throw error
      try {
        const listId = (list as { id: string }).id
        const english = await call(userToken, `/api/shopping-lists/${listId}/recipes`, 'POST', { recipeId: recipe.id, locale: 'en' })
        expect(english.status).toBe(200)
        const names = ((await english.json()) as { items: Array<{ name: string }> }).items.map(item => item.name).sort()
        expect(names).toEqual(['flour', 'salt'])
        const french = await call(userToken, `/api/shopping-lists/${listId}/recipes`, 'POST', { recipeId: recipe.id })
        expect(((await french.json()) as { items: Array<{ name: string }> }).items.map(item => item.name).sort()).toEqual(['farine', 'sel'])
        expect((await call(userToken, `/api/shopping-lists/${listId}/recipes`, 'POST', { recipeId: recipe.id, locale: 'de' })).status).toBe(400)
      } finally {
        await user.from('shopping_lists').delete().eq('id', (list as { id: string }).id)
      }
    })
  })
})
