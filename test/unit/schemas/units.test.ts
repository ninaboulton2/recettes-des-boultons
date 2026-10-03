import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { UNIT_CODES, isUnitCode, unitCodeSchema } from '#shared/schemas/units'

const MIGRATION = resolve(__dirname, '../../../supabase/migrations/0003_units.sql')
const LOCAL_DB_URL = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

/** Codes de la table `units` lus dans la migration (lignes à 7 colonnes de l'insert). */
function codesFromMigration(): string[] {
  const sql = readFileSync(MIGRATION, 'utf8')
  const start = sql.indexOf('insert into public.units')
  const end = sql.indexOf(';', start)
  const block = sql.slice(start, end)
  const re = /\(\s*'([a-z]+)'\s*,\s*'[^']*'\s*,\s*'[^']*'\s*,\s*'[^']*'\s*,\s*'(?:mass|volume|count|other)'/g
  return [...block.matchAll(re)].map(m => m[1] as string)
}

/** Codes de la base locale via psql, ou `null` si indisponible. */
function codesFromLocalDb(): string[] | null {
  try {
    const out = execFileSync('psql', [LOCAL_DB_URL, '-Atc', 'select code from public.units order by code'], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    return out.split('\n').map(s => s.trim()).filter(Boolean)
  } catch {
    return null
  }
}

describe('UNIT_CODES', () => {
  it('contient 37 codes uniques', () => {
    expect(UNIT_CODES).toHaveLength(37)
    expect(new Set(UNIT_CODES).size).toBe(37)
  })

  it('correspond exactement à la migration 0003_units.sql', () => {
    const migration = codesFromMigration()
    expect(migration).toHaveLength(37)
    expect([...UNIT_CODES].sort()).toEqual([...migration].sort())
  })

  const dbCodes = codesFromLocalDb()
  it.skipIf(dbCodes === null)('correspond exactement à la table units de la base locale', () => {
    expect([...UNIT_CODES].sort()).toEqual(dbCodes)
  })

  it('valide les codes connus et rejette le reste', () => {
    expect(unitCodeSchema.safeParse('g').success).toBe(true)
    expect(unitCodeSchema.safeParse('cas').success).toBe(true)
    expect(unitCodeSchema.safeParse('grammes').success).toBe(false)
    expect(unitCodeSchema.safeParse('G').success).toBe(false)
    expect(isUnitCode('pincee')).toBe(true)
    expect(isUnitCode('pincée')).toBe(false)
    expect(isUnitCode(null)).toBe(false)
  })
})
