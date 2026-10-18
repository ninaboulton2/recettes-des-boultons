// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SimilarRecipesResponse } from '#shared/schemas/similar'

/**
 * Test d'intégration de la détection de doublons (`POST /api/recipes/similar`)
 * contre la stack Supabase LOCALE et un serveur Nuxt de dev :
 *   npx nuxt dev --dotenv .env.local --port 3044
 *   APP_URL=http://localhost:3044 npm test
 * Aucun appel IA. Sauté automatiquement si `.env.local`, l'API Supabase ou le
 * serveur Nuxt sont absents. Données créées : préfixe `TEST_SIM_`, supprimées à la fin.
 */

const PREFIX = 'TEST_SIM_'
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
const appUp = supabaseUp && await isReachable(`${APP_URL}/api/recipes/similar`, { method: 'POST' })

const INGREDIENTS = ['carottes râpées', 'noix concassées', 'farine', 'sucre roux', 'œufs', 'huile de tournesol', 'cannelle', 'levure chimique']

describe.skipIf(!appUp)('POST /api/recipes/similar (base locale)', () => {
  let admin: SupabaseClient
  let adminToken = ''
  let userToken = ''
  let savedId = ''
  let savedTitle = ''

  const login = async (credentials: { email: string, password: string }) => {
    const client = createClient(env!.url, env!.key, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await client.auth.signInWithPassword(credentials)
    if (error) throw error
    return { client, token: data.session?.access_token ?? '' }
  }

  const similar = async (body: unknown, token = adminToken) => fetch(`${APP_URL}/api/recipes/similar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body)
  })

  const idsFor = async (body: unknown): Promise<string[]> => {
    const response = await similar(body)
    expect(response.status).toBe(200)
    return ((await response.json()) as SimilarRecipesResponse).similar.map(item => item.id)
  }

  beforeAll(async () => {
    const a = await login(ADMIN)
    admin = a.client
    adminToken = a.token
    userToken = (await login(USER)).token

    savedTitle = `${PREFIX}Gâteau à la carotte et aux noix`
    const added = await fetch(`${APP_URL}/api/add-recipe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        recipe: {
          title: savedTitle,
          category: 'desserts et gâteaux',
          sections: [{
            name: '',
            type: 'ingredients',
            orderIndex: 0,
            ingredients: INGREDIENTS.map((name, orderIndex) => ({ name, amount: 1, orderIndex })),
            instructions: []
          }]
        },
        // Traduction jointe : pas d'appel IA (feature translate_recipe) pendant ce test.
        lang: 'fr',
        translation: {
          title: `${PREFIX}Carrot and walnut cake`,
          content: { sections: [{ name: '', ingredients: INGREDIENTS.map(name => ({ name: `[EN] ${name}`, amount: null, unit: null })), instructions: [] }] }
        }
      })
    })
    expect(added.status).toBe(200)
    savedId = ((await added.json()) as { recipe: { id: string } }).recipe.id
  })

  afterAll(async () => {
    if (admin) {
      const { data: leftovers } = await admin.from('recipes').select('id').like('title', `${PREFIX}%`)
      for (const row of (leftovers ?? []) as Array<{ id: string }>) {
        await admin.rpc('delete_recipe', { p_id: row.id })
      }
      await admin.auth.signOut({ scope: 'local' })
    }
  })

  it('refuse sans session (401), un non-admin (403) et un titre vide (400)', async () => {
    expect((await similar({ title: 'x' }, '')).status).toBe(401)
    expect((await similar({ title: 'x' }, userToken)).status).toBe(403)
    const invalid = await similar({ title: '   ' })
    expect(invalid.status).toBe(400)
    expect(((await invalid.json()) as { statusMessage?: string }).statusMessage).toContain('title')
  })

  it('retrouve la recette par son titre, malgré accents, casse, ponctuation et mots vides', async () => {
    const response = await similar({ title: 'test sim - GATEAU a la CAROTTE & aux noix !' })
    const { similar: found } = (await response.json()) as SimilarRecipesResponse
    expect(found[0]).toMatchObject({ id: savedId, title: savedTitle, reason: 'title', titleScore: 1 })
    expect(found.length).toBeLessThanOrEqual(3)
  })

  it('retrouve une recette renommée grâce aux ingrédients', async () => {
    const response = await similar({
      title: `${PREFIX}Carrot cake`,
      ingredientNames: ['Carottes', 'noix', 'Farine', 'sucre roux', 'oeufs', 'huile de tournesol', 'cannelle moulue', 'levure chimique']
    })
    const { similar: found } = (await response.json()) as SimilarRecipesResponse
    expect(found[0]).toMatchObject({ id: savedId, reason: 'ingredients' })
    expect(found[0]?.ingredientScore).toBeGreaterThanOrEqual(0.7)
  })

  it('ne renvoie rien pour une recette sans rapport, ni pour la recette exclue', async () => {
    const unrelated = {
      title: `${PREFIX}Soupe miso au tofu`,
      ingredientNames: ['pâte de miso', 'tofu soyeux', 'algue wakame', 'oignon vert', 'bouillon dashi']
    }
    expect(await idsFor(unrelated)).not.toContain(savedId)
    expect(await idsFor({ title: savedTitle, ingredientNames: INGREDIENTS, excludeId: savedId })).not.toContain(savedId)
  })
})
