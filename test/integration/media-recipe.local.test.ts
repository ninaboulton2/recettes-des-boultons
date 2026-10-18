// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { recipeInputSchema } from '#shared/schemas/recipe'
import type { TranslateRecipeResponse } from '#shared/schemas/ai'
import { RECIPE_UPLOAD_MAX_BYTES, type TranscribeRecipeResponse } from '#shared/schemas/media'
import { MOCK_RECIPE, MOCK_TRANSCRIPT } from '../../server/utils/ai/mock'

/**
 * Test d'intégration de `POST /api/extract-recipe` (photo / PDF) et de
 * `POST /api/transcribe-recipe` (dictée) contre la stack Supabase LOCALE et le
 * serveur Nuxt de dev lancé avec `AI_PROVIDER=mock` (aucun appel payant) :
 *   npx nuxt dev --dotenv .env.local --port 3042   (ou npm run dev:local → 3001)
 *   APP_URL=http://localhost:3042 npm test
 * Sauté automatiquement si `.env.local`, l'API Supabase ou le serveur Nuxt
 * sont absents. Aucune recette n'est enregistrée (les endpoints ne font que lire).
 */

const APP_URL = process.env.APP_URL ?? 'http://localhost:3001'
// Comptes dédiés (voir translate-recipe.local.test.ts : signOut global des autres tests).
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
const appUp = supabaseUp && await isReachable(`${APP_URL}/api/extract-recipe`, { method: 'POST' })

// Plus petits fichiers valides pour chaque format (seul l'en-tête compte, le fournisseur est simulé).
const JPEG = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0, 0x10, 0x4A, 0x46, 0x49, 0x46, 0, 1])
const PDF = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n')
const WEBM = new Uint8Array([0x1A, 0x45, 0xDF, 0xA3, 0x9F, 0x42, 0x86, 0x81, 0x01, 0, 0, 0, 0, 0])
const M4A = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x4D, 0x34, 0x41, 0x20, 0, 0, 0, 0, 0, 0, 0, 0])

function form(entries: Array<[string, Uint8Array | string, string?, string?]>): FormData {
  const data = new FormData()
  for (const [name, value, filename, type] of entries) {
    if (typeof value === 'string') data.append(name, value)
    else data.append(name, new Blob([value as BlobPart], { type: type ?? 'application/octet-stream' }), filename)
  }
  return data
}

describe.skipIf(!appUp)('POST /api/extract-recipe et /api/transcribe-recipe (mock) + ai_usage', () => {
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

  const post = (path: string, token: string | null, body: FormData) => fetch(`${APP_URL}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body
  })

  // Filtré par `feature` : translate-recipe.local.test.ts journalise aussi pour ce compte, en parallèle.
  const lastUsage = async (feature: string) => {
    const { data } = await admin.from('ai_usage')
      .select('provider, model, feature, status, input_tokens, output_tokens, estimated_cost_usd')
      .eq('user_id', adminId)
      .eq('feature', feature)
      .order('created_at', { ascending: false })
      .limit(1)
    return data?.[0]
  }

  const usageCount = async (feature: string) => {
    const { count } = await admin.from('ai_usage').select('id', { count: 'exact', head: true }).eq('user_id', adminId).eq('feature', feature)
    return count ?? 0
  }

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
    if (admin) await admin.auth.signOut({ scope: 'local' })
    if (user) await user.auth.signOut({ scope: 'local' })
  })

  describe('extract-recipe', () => {
    it('refuse sans session (401) et un non-admin (403)', async () => {
      expect((await post('/api/extract-recipe', null, form([['files', JPEG, 'p.jpg', 'image/jpeg']]))).status).toBe(401)
      expect((await post('/api/extract-recipe', userToken, form([['files', JPEG, 'p.jpg', 'image/jpeg']]))).status).toBe(403)
    })

    it('renvoie un RecipeInput valide pour une photo et journalise feature=extract', async () => {
      const before = await usageCount('extract')
      const response = await post('/api/extract-recipe', adminToken, form([['files', JPEG, 'page.jpg', 'image/jpeg']]))
      expect(response.status).toBe(200)
      const data = (await response.json()) as TranslateRecipeResponse
      expect(data.success).toBe(true)
      expect(recipeInputSchema.safeParse(data.recipe).success).toBe(true)
      expect(data.recipe.title).toBe(MOCK_RECIPE.title)
      // Recettes bilingues : langue détectée + traduction dans l'autre langue (plus de langue cible).
      expect(data.lang).toBe('fr')
      expect(data.translation.title).toBe(`[EN] ${MOCK_RECIPE.title}`)
      expect(data.usage).toMatchObject({ provider: 'mock', model: 'mock-recipe', estimatedCostUsd: 0 })
      expect(data.usage.inputTokens).toBeGreaterThan(0)
      expect(await usageCount('extract')).toBe(before + 1)
      expect(await lastUsage('extract')).toMatchObject({ feature: 'extract', status: 'ok', provider: 'mock' })
    })

    it('accepte un PDF et plusieurs fichiers', async () => {
      const response = await post('/api/extract-recipe', adminToken, form([
        ['files', PDF, 'livre.pdf', 'application/pdf'],
        ['files', JPEG, 'page2.jpg', 'image/jpeg']
      ]))
      expect(response.status).toBe(200)
    })

    it('reconnaît le format à l\'en-tête, pas au type annoncé (400)', async () => {
      const text = new TextEncoder().encode('ceci est du texte, pas une image')
      const response = await post('/api/extract-recipe', adminToken, form([['files', text, 'faux.jpg', 'image/jpeg']]))
      expect(response.status).toBe(400)
      const payload = (await response.json()) as { statusMessage?: string }
      expect(payload.statusMessage).toContain('format non pris en charge')
    })

    it('refuse zéro fichier et plus de 4 fichiers (400) ; une ancienne langue cible est ignorée', async () => {
      expect((await post('/api/extract-recipe', adminToken, form([['targetLanguage', 'fr']]))).status).toBe(400)
      const five = Array.from({ length: 5 }, (_, i): [string, Uint8Array, string, string] => ['files', JPEG, `p${i}.jpg`, 'image/jpeg'])
      expect((await post('/api/extract-recipe', adminToken, form(five))).status).toBe(400)
      expect((await post('/api/extract-recipe', adminToken, form([['files', JPEG, 'p.jpg', 'image/jpeg'], ['targetLanguage', 'de']]))).status).toBe(200)
    })

    it('refuse un envoi trop volumineux (413 ou 400) sans appeler l\'IA', async () => {
      const before = await usageCount('extract')
      const big = new Uint8Array(RECIPE_UPLOAD_MAX_BYTES + 1024)
      big.set(JPEG)
      const response = await post('/api/extract-recipe', adminToken, form([['files', big, 'enorme.jpg', 'image/jpeg']]))
      expect([400, 413]).toContain(response.status)
      expect(await usageCount('extract')).toBe(before)
    })

    it('refuse un corps non multipart (400)', async () => {
      const response = await fetch(`${APP_URL}/api/extract-recipe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ files: [] })
      })
      expect(response.status).toBe(400)
    })
  })

  describe('transcribe-recipe', () => {
    it('refuse sans session (401) et un non-admin (403)', async () => {
      expect((await post('/api/transcribe-recipe', null, form([['audio', WEBM, 'd.webm', 'audio/webm']]))).status).toBe(401)
      expect((await post('/api/transcribe-recipe', userToken, form([['audio', WEBM, 'd.webm', 'audio/webm']]))).status).toBe(403)
    })

    it('transcrit un WebM (Chrome) et journalise feature=transcribe au tarif de la minute', async () => {
      const before = await usageCount('transcribe')
      const response = await post('/api/transcribe-recipe', adminToken, form([
        ['audio', WEBM, 'dictee.webm', 'audio/webm;codecs=opus'],
        ['durationSeconds', '42.5']
      ]))
      expect(response.status).toBe(200)
      const data = (await response.json()) as TranscribeRecipeResponse
      expect(data.text).toBe(MOCK_TRANSCRIPT)
      expect(data.usage).toMatchObject({ provider: 'mock', model: 'mock-transcribe', audioSeconds: 42.5, estimatedCostUsd: 0 })
      expect(await usageCount('transcribe')).toBe(before + 1)
      expect(await lastUsage('transcribe')).toMatchObject({ feature: 'transcribe', status: 'ok', model: 'mock-transcribe', input_tokens: 0, output_tokens: 0 })
    })

    it('transcrit aussi un MP4 (Safari) sans durée annoncée', async () => {
      const response = await post('/api/transcribe-recipe', adminToken, form([['audio', M4A, 'dictee.m4a', 'audio/mp4']]))
      expect(response.status).toBe(200)
      const data = (await response.json()) as TranscribeRecipeResponse
      expect(data.text).toBe(MOCK_TRANSCRIPT)
    })

    it('refuse un audio absent, un format inconnu et une durée excessive (400)', async () => {
      expect((await post('/api/transcribe-recipe', adminToken, form([['durationSeconds', '5']]))).status).toBe(400)
      expect((await post('/api/transcribe-recipe', adminToken, form([['audio', JPEG, 'image.webm', 'audio/webm']]))).status).toBe(400)
      expect((await post('/api/transcribe-recipe', adminToken, form([['audio', WEBM, 'd.webm', 'audio/webm'], ['durationSeconds', '900']]))).status).toBe(400)
    })

    it('refuse un enregistrement de plus de 4 Mo (413 ou 400)', async () => {
      const big = new Uint8Array(5 * 1024 * 1024)
      big.set(WEBM)
      const response = await post('/api/transcribe-recipe', adminToken, form([['audio', big, 'long.webm', 'audio/webm']]))
      expect([400, 413]).toContain(response.status)
    })
  })
})
