// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { recipeInputSchema } from '#shared/schemas/recipe'
import { isUnitCode } from '#shared/schemas/units'
import type { TranslateRecipeResponse } from '#shared/schemas/ai'

/**
 * Test d'intégration du traducteur contre la stack Supabase LOCALE et le
 * serveur Nuxt de dev lancé avec `AI_PROVIDER=mock` (aucun appel payant) :
 *   npx nuxt dev --dotenv .env.local --port 3024   (ou npm run dev:local → 3001)
 *   APP_URL=http://localhost:3024 npm test
 * Sauté automatiquement si `.env.local`, l'API Supabase ou le serveur Nuxt
 * sont absents. Données créées : préfixe `TEST_3D_`, supprimées à la fin.
 */

const PREFIX = 'TEST_3D_'
const APP_URL = process.env.APP_URL ?? 'http://localhost:3001'
// Comptes dédiés : `save-recipe.local.test.ts` (admin@local.test) fait un signOut
// global en fin de test, qui révoquerait nos sessions si on partageait le compte.
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
const appUp = supabaseUp && await isReachable(`${APP_URL}/api/translate-recipe`, { method: 'POST' })

const SAMPLE = `${PREFIX}Cookies du test\n\n2 cups flour\n1 cup butter\n2 eggs\n\nBake at 350°F for 12 minutes.`

describe.skipIf(!appUp)('POST /api/translate-recipe (mock) + ai_usage (base locale)', () => {
  let admin: SupabaseClient
  let user: SupabaseClient
  let adminToken = ''
  let userToken = ''
  let adminId = ''

  const login = async (credentials: { email: string, password: string }) => {
    const client = createClient(env!.url, env!.key, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await client.auth.signInWithPassword(credentials)
    if (error) throw error
    return { client, token: data.session?.access_token ?? '', id: data.user?.id ?? '' }
  }

  const post = (token: string, body: unknown) => fetch(`${APP_URL}/api/translate-recipe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  })

  beforeAll(async () => {
    const a = await login(ADMIN)
    admin = a.client
    adminToken = a.token
    adminId = a.id
    const u = await login(USER)
    user = u.client
    userToken = u.token
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

  it('refuse un non-admin (403) et un texte trop court (400)', async () => {
    expect((await post(userToken, { recipeText: SAMPLE })).status).toBe(403)
    const short = await post(adminToken, { recipeText: 'court' })
    expect(short.status).toBe(400)
    const payload = (await short.json()) as { statusMessage?: string }
    expect(payload.statusMessage).toContain('recipeText')
  })

  it('renvoie un RecipeInput valide avec unit_code et journalise dans ai_usage', async () => {
    const { count: before } = await admin.from('ai_usage').select('id', { count: 'exact', head: true }).eq('user_id', adminId)

    const response = await post(adminToken, { recipeText: SAMPLE, targetLanguage: 'fr' })
    expect(response.status).toBe(200)
    const data = (await response.json()) as TranslateRecipeResponse
    expect(data.success).toBe(true)
    expect(recipeInputSchema.safeParse(data.recipe).success).toBe(true)
    expect(data.recipe.title).toBe(`${PREFIX}Cookies du test`)
    expect(data.usage).toMatchObject({ provider: 'mock', model: 'mock-recipe', estimatedCostUsd: 0 })
    expect(data.usage.inputTokens).toBeGreaterThan(0)

    const ingredients = data.recipe.sections?.[0]?.ingredients ?? []
    expect(ingredients.find(i => i.name === 'farine')).toMatchObject({ unitCode: 'g', unit: 'g', amount: 280 })
    expect(ingredients.find(i => i.name === 'extrait de vanille')).toMatchObject({ unitCode: 'cac', unit: 'c. à c.' })
    expect(ingredients.find(i => i.name === 'noix de pécan')).toMatchObject({ unitCode: null, unit: 'stick', optional: true })

    const { count: after, data: rows } = await admin.from('ai_usage')
      .select('provider, model, status, input_tokens, output_tokens, estimated_cost_usd, feature', { count: 'exact' })
      .eq('user_id', adminId)
      .order('created_at', { ascending: false })
      .limit(1)
    expect((after ?? 0) - (before ?? 0)).toBe(1)
    expect(rows?.[0]).toMatchObject({ provider: 'mock', model: 'mock-recipe', status: 'ok', feature: 'translate', estimated_cost_usd: 0 })
  })

  it('la recette convertie passe dans add-recipe avec les unit_code en base', async () => {
    const translated = await post(adminToken, { recipeText: SAMPLE })
    const { recipe } = (await translated.json()) as TranslateRecipeResponse

    const added = await fetch(`${APP_URL}/api/add-recipe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ recipe })
    })
    expect(added.status).toBe(200)
    const { recipe: saved } = (await added.json()) as { recipe: { id: string, sections: Array<{ ingredients: Array<{ name: string, unitCode: string | null, unit: string | null }> }> } }

    const { data: rows } = await admin.from('recipe_ingredients')
      .select('name, unit, unit_code, amount_num, recipe_sections!inner(recipe_id)')
      .eq('recipe_sections.recipe_id', saved.id)
    const byName = new Map((rows ?? []).map(r => [r.name, r]))
    expect(byName.get('farine')).toMatchObject({ unit_code: 'g', amount_num: 280 })
    expect(byName.get('extrait de vanille')).toMatchObject({ unit_code: 'cac' })
    // Sans code côté IA, la graphie d'origine est conservée et la base tente
    // `normalize_unit` (alias « stick » → branche en 0003) : code valide ou null.
    const pecan = byName.get('noix de pécan')
    expect(pecan).toMatchObject({ unit: 'stick' })
    expect(pecan?.unit_code === null || isUnitCode(pecan?.unit_code)).toBe(true)

    await admin.rpc('delete_recipe', { p_id: saved.id })
  })

  it('check_ai_quota compte les appels du jour de l\'utilisateur (RLS)', async () => {
    const { data: wide } = await admin.rpc('check_ai_quota', { p_max_per_day: 10_000 })
    expect(wide).toBe(true)
    const { data: tight } = await admin.rpc('check_ai_quota', { p_max_per_day: 1 })
    expect(tight).toBe(false)
    // L'utilisateur simple n'a aucun appel aujourd'hui et ne voit pas ceux de l'admin.
    const { data: userQuota } = await user.rpc('check_ai_quota', { p_max_per_day: 1 })
    expect(userQuota).toBe(true)
    const { data: visible } = await user.from('ai_usage').select('id').eq('user_id', adminId)
    expect(visible).toEqual([])
  })
})
