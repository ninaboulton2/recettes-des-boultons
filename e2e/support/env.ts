import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Environnement des tests e2e : `.env.local` (base Supabase LOCALE) est chargé
 * s'il existe ; les variables déjà définies (CI) l'emportent.
 *
 * Garde-fou : les parcours écrivent en base (données préfixées `E2E_`,
 * supprimées ensuite) — refus net si l'URL Supabase n'est pas locale.
 */
const envFile = resolve(import.meta.dirname, '../../.env.local')
if (existsSync(envFile)) {
  for (const [key, value] of Object.entries(parseEnv(envFile))) {
    process.env[key] ??= value
  }
}

function parseEnv(file: string): Record<string, string> {
  // process.loadEnvFile écraserait les variables déjà définies : lecture manuelle.
  const out: Record<string, string> = {}
  const raw = readFileSync(file, 'utf8')
  for (const line of raw.split('\n')) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line)
    if (match) out[match[1] as string] = (match[2] as string).replace(/^(['"])(.*)\1$/, '$2')
  }
  return out
}

export const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? ''

export function assertLocalSupabase(): void {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY manquants : créer .env.local (voir supabase/local/README.md).')
  }
  const host = new URL(SUPABASE_URL).hostname
  if (!['127.0.0.1', 'localhost', '[::1]', '::1'].includes(host)) {
    throw new Error(`Refus : les tests e2e écrivent en base et ${SUPABASE_URL} n'est pas une base locale.`)
  }
}
