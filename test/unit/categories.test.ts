import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import {
  CATEGORY_COLOR_CHOICES,
  CATEGORY_ICON_CHOICES,
  categoryFieldsSchema,
  DEFAULT_CATEGORY_ICON
} from '../../shared/schemas/categories'
import {
  categoryLabel,
  slugifyCategory,
  sortCategories,
  SUGGESTED_CATEGORIES,
  toMyCategory,
  uniqueSlug,
  type CategoryRow,
  type MyCategory
} from '../../shared/utils/categories'
import { addSuggestedCategories, createCategory, deleteCategory, listMyCategories, reorderCategories, updateCategory } from '../../app/composables/useMyCategories'

const row = (over: Partial<CategoryRow> = {}): CategoryRow => ({
  id: '11111111-1111-4111-8111-111111111111', owner_id: 'o', slug: 'soupes', name_fr: 'Soupes', name_en: 'Soups', icon: 'i-lucide-soup',
  color: '#c2603e', sort_order: 0, created_at: 'x', updated_at: 'x', ...over
})

describe('catégories : lecture défensive (icon et color sont du texte libre en base)', () => {
  it('garde une icône et une couleur valides', () => {
    expect(toMyCategory(row())).toMatchObject({ icon: 'i-lucide-soup', color: '#c2603e', nameFr: 'Soupes', nameEn: 'Soups' })
  })
  it('remplace une icône hors liste et une couleur invalide', () => {
    for (const icon of ['i-lucide-<script>', 'javascript:alert(1)', 'i-mdi-evil', '', null]) {
      expect(toMyCategory(row({ icon })).icon, String(icon)).toBe(DEFAULT_CATEGORY_ICON)
    }
    for (const color of ['red', 'url(x)', '#12', '#aa4466;x', '', null]) {
      expect(toMyCategory(row({ color })).color, String(color)).toBeNull()
    }
  })
  it('libellé : langue demandée puis l\'autre puis la clé', () => {
    const c = { nameFr: 'Soupes', nameEn: null, slug: 'soupes' }
    expect(categoryLabel(c, 'fr')).toBe('Soupes')
    expect(categoryLabel(c, 'en')).toBe('Soupes')
    expect(categoryLabel({ nameFr: null, nameEn: 'Soups', slug: 's' }, 'fr')).toBe('Soups')
    expect(categoryLabel({ nameFr: null, nameEn: null, slug: 's' }, 'fr')).toBe('s')
  })
})

describe('catégories : saisie', () => {
  it('exige au moins un nom, accepte les listes blanches', () => {
    expect(categoryFieldsSchema.safeParse({ nameFr: '', nameEn: '' }).success).toBe(false)
    expect(categoryFieldsSchema.safeParse({ nameFr: '  ' }).success).toBe(false)
    const ok = categoryFieldsSchema.safeParse({ nameFr: ' Tartes ', icon: 'i-lucide-cake', color: '#AA4466' })
    expect(ok.success).toBe(true)
    if (ok.success) expect(ok.data).toMatchObject({ nameFr: 'Tartes', icon: 'i-lucide-cake', color: '#aa4466' })
    expect(categoryFieldsSchema.safeParse({ nameEn: 'Pies' }).success).toBe(true)
  })
  it('refuse une icône hors liste, une couleur libre invalide, un nom piégé ou trop long', () => {
    expect(categoryFieldsSchema.safeParse({ nameFr: 'x', icon: 'i-mdi-evil' }).success).toBe(false)
    expect(categoryFieldsSchema.safeParse({ nameFr: 'x', color: 'red' }).success).toBe(false)
    expect(categoryFieldsSchema.safeParse({ nameFr: '<b>x</b>' }).success).toBe(false)
    expect(categoryFieldsSchema.safeParse({ nameFr: 'x'.repeat(41) }).success).toBe(false)
    expect(categoryFieldsSchema.safeParse({ nameFr: 'a​b' }).success).toBe(false)
  })
  it('les choix proposés sont tous valides', () => {
    for (const color of CATEGORY_COLOR_CHOICES) expect(categoryFieldsSchema.safeParse({ nameFr: 'x', color }).success).toBe(true)
    for (const icon of CATEGORY_ICON_CHOICES) expect(categoryFieldsSchema.safeParse({ nameFr: 'x', icon }).success).toBe(true)
  })
})

describe('catégories : clés et ordre', () => {
  it('slug : minuscules sans accents, conforme à la contrainte de la base', () => {
    expect(slugifyCategory('Desserts & Gâteaux !')).toBe('desserts_gateaux')
    expect(slugifyCategory('Œufs')).toMatch(/^[a-z0-9][a-z0-9_-]{0,59}$/)
    expect(slugifyCategory('!!!')).toBe('categorie')
    expect(slugifyCategory('x'.repeat(200)).length).toBeLessThanOrEqual(55)
    for (const s of SUGGESTED_CATEGORIES) expect(s.slug).toMatch(/^[a-z0-9][a-z0-9_-]{0,59}$/)
  })
  it('slug unique', () => {
    expect(uniqueSlug('tartes', new Set())).toBe('tartes')
    expect(uniqueSlug('tartes', new Set(['tartes', 'tartes_2']))).toBe('tartes_3')
  })
  it('tri par rang puis nom', () => {
    const list = [{ sortOrder: 2, nameFr: 'B', nameEn: null, slug: 'b' }, { sortOrder: 1, nameFr: 'Z', nameEn: null, slug: 'z' }, { sortOrder: 1, nameFr: 'A', nameEn: null, slug: 'a' }]
    expect(sortCategories(list).map(c => c.slug)).toEqual(['a', 'z', 'b'])
  })
  it('les 9 suggestions sont celles du remplissage 0018 (mêmes clés)', () => {
    expect(SUGGESTED_CATEGORIES.map(s => s.slug)).toEqual(['soupes', 'entrees', 'plats', 'poissons', 'viandes', 'yaourts_et_fromages', 'desserts_et_gateaux', 'boissons', 'confitures'])
  })
})

/** Faux client supabase-js : enregistre les appels de la chaîne `from(...)`. */
function fakeClient(options: { rows?: CategoryRow[], failInsertWith?: Array<{ code: string }> } = {}) {
  const calls: Array<{ table: string, op: string, payload?: unknown, filters: Array<[string, unknown]> }> = []
  const failures = [...(options.failInsertWith ?? [])]
  const client = {
    from(table: string) {
      const call: { table: string, op: string, payload?: unknown, filters: Array<[string, unknown]> } = { table, op: 'select', filters: [] }
      calls.push(call)
      const chain: Record<string, unknown> = {
        select: () => chain,
        order: () => chain,
        insert: (payload: unknown) => { call.op = 'insert'; call.payload = payload; return chain },
        update: (payload: unknown) => { call.op = 'update'; call.payload = payload; return chain },
        upsert: (payload: unknown, opts: unknown) => { call.op = 'upsert'; call.payload = { payload, opts }; return Promise.resolve({ error: null }) },
        delete: () => { call.op = 'delete'; return chain },
        eq: (column: string, value: unknown) => { call.filters.push([column, value]); return chain },
        single: () => {
          const failure = call.op === 'insert' ? failures.shift() : undefined
          if (failure) return Promise.resolve({ data: null, error: failure })
          const payload = (call.payload ?? {}) as Partial<CategoryRow>
          return Promise.resolve({ data: row({ ...payload, id: 'new' }), error: null })
        },
        then: (resolve: (value: unknown) => void) => resolve({ data: options.rows ?? [], error: null })
      }
      return chain
    }
  }
  return { client: client as unknown as SupabaseClient, calls }
}

describe('catégories : écritures directes (useMyCategories)', () => {
  const existing: MyCategory[] = [
    { id: 'a', slug: 'soupes', nameFr: 'Soupes', nameEn: null, icon: 'i-lucide-soup', color: null, sortOrder: 0 },
    { id: 'b', slug: 'plats', nameFr: 'Plats', nameEn: null, icon: 'i-lucide-utensils', color: null, sortOrder: 1 }
  ]

  it('liste : tri et lecture défensive', async () => {
    const { client } = fakeClient({ rows: [row({ id: 'z', sort_order: 5, icon: 'evil' }), row({ id: 'y', slug: 'a', sort_order: 1 })] })
    const list = await listMyCategories(client)
    expect(list.map(c => c.id)).toEqual(['y', 'z'])
    expect(list[1]?.icon).toBe(DEFAULT_CATEGORY_ICON)
  })

  it('création : propriétaire, clé unique, rang à la suite, valeurs assainies', async () => {
    const { client, calls } = fakeClient()
    await createCategory(client, 'owner-1', { nameFr: 'Soupes', icon: 'i-lucide-soup' }, existing)
    expect(calls[0]).toMatchObject({ table: 'categories', op: 'insert' })
    expect(calls[0]?.payload).toMatchObject({ owner_id: 'owner-1', slug: 'soupes_2', name_fr: 'Soupes', name_en: null, icon: 'i-lucide-soup', color: null, sort_order: 2 })
  })

  it('création : reprend avec une autre clé en cas de collision (23505)', async () => {
    const { client, calls } = fakeClient({ failInsertWith: [{ code: '23505' }] })
    await createCategory(client, 'owner-1', { nameFr: 'Tartes' }, existing)
    expect(calls.map(c => (c.payload as { slug: string }).slug)).toEqual(['tartes', 'tartes_2'])
  })

  it('création : refuse une saisie invalide sans rien envoyer, et au-delà de 60 catégories', async () => {
    const { client, calls } = fakeClient()
    await expect(createCategory(client, 'o', { nameFr: '' }, existing)).rejects.toThrow(/Données invalides/)
    await expect(createCategory(client, 'o', { nameFr: 'x', icon: 'i-mdi-evil' as never }, existing)).rejects.toThrow(/Données invalides/)
    const many = Array.from({ length: 60 }, (_, i) => ({ ...existing[0]!, id: String(i), slug: `c${i}` }))
    await expect(createCategory(client, 'o', { nameFr: 'x' }, many)).rejects.toThrow(/60 catégories/)
    expect(calls).toHaveLength(0)
  })

  it('modification : ne touche ni la clé ni le propriétaire', async () => {
    const { client, calls } = fakeClient()
    await updateCategory(client, 'a', { nameFr: 'Potages', nameEn: 'Soups', icon: 'i-lucide-soup', color: '#16a34a' })
    expect(calls[0]).toMatchObject({ op: 'update', filters: [['id', 'a']] })
    expect(Object.keys(calls[0]?.payload as object).sort()).toEqual(['color', 'icon', 'name_en', 'name_fr'])
  })

  it('suppression et ordre', async () => {
    const { client, calls } = fakeClient()
    await deleteCategory(client, 'a')
    expect(calls[0]).toMatchObject({ op: 'delete', filters: [['id', 'a']] })
    const second = fakeClient()
    await reorderCategories(second.client, ['b', 'a'], existing)
    expect(second.calls.map(c => [c.filters[0]?.[1], (c.payload as { sort_order: number }).sort_order])).toEqual([['b', 0], ['a', 1]])
    const third = fakeClient()
    await reorderCategories(third.client, ['a', 'b'], existing)
    expect(third.calls).toHaveLength(0)
  })

  it('suggestions : seulement les clés manquantes, sans doublon', async () => {
    const { client, calls } = fakeClient()
    const added = await addSuggestedCategories(client, 'o', existing)
    expect(added).toBe(7)
    const { payload, opts } = calls[0]?.payload as { payload: Array<{ slug: string, sort_order: number }>, opts: unknown }
    expect(payload.map(p => p.slug)).not.toContain('soupes')
    expect(payload[0]?.sort_order).toBe(2)
    expect(opts).toEqual({ onConflict: 'owner_id,slug', ignoreDuplicates: true })
  })
})
