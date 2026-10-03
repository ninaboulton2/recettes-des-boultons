import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Parité des traductions : `fr.json` et `en.json` ont exactement les mêmes
 * clés, aucune valeur vide, les mêmes paramètres (`{n}`, `{title}`…), et
 * toute clé littérale utilisée dans `app/` (`t('…')`, `$t('…')`) existe.
 */

type Messages = { [key: string]: string | Messages }

function flatten(messages: Messages, prefix = ''): Map<string, string> {
  const entries = new Map<string, string>()
  for (const [key, value] of Object.entries(messages)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') entries.set(path, value)
    else for (const [childKey, childValue] of flatten(value, path)) entries.set(childKey, childValue)
  }
  return entries
}

const placeholders = (message: string) =>
  [...message.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort()

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(vue|ts)$/.test(name) ? [path] : []
  })
}

// Lecture brute (un `import` de JSON passerait par le compilateur Intlify).
const ROOT = process.cwd()
const readMessages = (locale: string) =>
  JSON.parse(readFileSync(resolve(ROOT, 'i18n/locales', `${locale}.json`), 'utf8')) as Messages

const frKeys = flatten(readMessages('fr'))
const enKeys = flatten(readMessages('en'))

describe('i18n', () => {
  it('fr.json et en.json ont exactement les mêmes clés', () => {
    const missingInEn = [...frKeys.keys()].filter(key => !enKeys.has(key))
    const missingInFr = [...enKeys.keys()].filter(key => !frKeys.has(key))
    expect({ missingInEn, missingInFr }).toEqual({ missingInEn: [], missingInFr: [] })
  })

  it('aucune valeur vide', () => {
    const empty = [...frKeys, ...enKeys].filter(([, value]) => value.trim() === '').map(([key]) => key)
    expect(empty).toEqual([])
  })

  it('les mêmes paramètres dans les deux langues', () => {
    const mismatched = [...frKeys]
      .filter(([key, value]) => enKeys.has(key) && placeholders(value).join() !== placeholders(enKeys.get(key) ?? '').join())
      .map(([key]) => key)
    expect(mismatched).toEqual([])
  })

  it('toutes les clés littérales utilisées dans app/ existent', () => {
    const appDir = resolve(ROOT, 'app')
    const missing: string[] = []
    for (const file of sourceFiles(appDir)) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(/(?:\$t|\bt|\bte|translateKey)\(\s*'([\w.]+)'/g)) {
        const key = match[1] ?? ''
        if (!frKeys.has(key)) missing.push(`${file.slice(appDir.length + 1)} → ${key}`)
      }
    }
    expect(missing).toEqual([])
  })
})
