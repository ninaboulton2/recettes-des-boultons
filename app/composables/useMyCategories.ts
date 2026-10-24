import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '#shared/types/database'
import {
  categoryFieldsSchema,
  MAX_CATEGORIES,
  type CategoryFields,
  type CategoryFieldsInput
} from '#shared/schemas/categories'
import {
  slugifyCategory,
  sortCategories,
  SUGGESTED_CATEGORIES,
  toMyCategory,
  uniqueSlug,
  type MyCategory
} from '#shared/utils/categories'
import { parseClientInput } from './useCookbook'

/**
 * Catégories personnelles (v2). Écritures DIRECTES sur la table `categories` : les politiques de 0019
 * (`categories_*_own`) limitent chacun aux siennes, aucune RPC n'est nécessaire. Ce que la base ne contrôle pas
 * (`icon` et `color` sont du texte libre, aucun plafond de nombre) l'est ici : liste blanche d'icônes, couleur
 * `#rrggbb`, 60 catégories au plus, et lecture défensive (`toMyCategory`).
 *
 * Fonctions pures `fn(supabase, …)` (testables sans Nuxt) ; le store `useCategoriesStore` les lie à la session.
 */

type Client = SupabaseClient<Database>

const UNIQUE_VIOLATION = '23505'

/** Mes catégories, dans l'ordre d'affichage. */
export async function listMyCategories(supabase: Client): Promise<MyCategory[]> {
  const { data, error } = await supabase.from('categories').select('*').order('sort_order').order('created_at')
  if (error) throw error
  return sortCategories((data ?? []).map(toMyCategory))
}

/** Crée une catégorie en fin de liste. Clé (`slug`) tirée du nom, rendue unique. */
export async function createCategory(supabase: Client, ownerId: string, input: CategoryFieldsInput, existing: readonly MyCategory[]): Promise<MyCategory> {
  if (existing.length >= MAX_CATEGORIES) throw new Error(`Données invalides : au plus ${MAX_CATEGORIES} catégories`)
  const fields: CategoryFields = parseClientInput(categoryFieldsSchema, input)
  const taken = new Set(existing.map(category => category.slug))
  const base = slugifyCategory(fields.nameFr ?? fields.nameEn ?? '')
  const sortOrder = existing.reduce((max, category) => Math.max(max, category.sortOrder), -1) + 1

  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = uniqueSlug(base, taken)
    const { data, error } = await supabase.from('categories').insert({
      owner_id: ownerId,
      slug,
      name_fr: fields.nameFr ?? null,
      name_en: fields.nameEn ?? null,
      icon: fields.icon,
      color: fields.color ?? null,
      sort_order: sortOrder
    }).select('*').single()
    if (!error) return toMyCategory(data)
    // Clé déjà prise (autre onglet) : on la marque prise et on recommence.
    if (error.code === UNIQUE_VIOLATION) {
      taken.add(slug)
      continue
    }
    throw error
  }
  throw new Error('Impossible de créer la catégorie (clé déjà utilisée)')
}

/** Renomme / change l'icône ou la couleur. La clé (`slug`) ne change jamais. */
export async function updateCategory(supabase: Client, id: string, input: CategoryFieldsInput): Promise<MyCategory> {
  const fields = parseClientInput(categoryFieldsSchema, input)
  const { data, error } = await supabase.from('categories').update({
    name_fr: fields.nameFr ?? null,
    name_en: fields.nameEn ?? null,
    icon: fields.icon,
    color: fields.color ?? null
  }).eq('id', id).select('*').single()
  if (error) throw error
  return toMyCategory(data)
}

/** Supprime une catégorie ; ses recettes passent « sans catégorie » (`on delete set null`). */
export async function deleteCategory(supabase: Client, id: string): Promise<void> {
  const { error } = await supabase.from('categories').delete().eq('id', id)
  if (error) throw error
}

/** Nouvel ordre (identifiants dans l'ordre voulu) : n'écrit que les lignes dont le rang change. */
export async function reorderCategories(supabase: Client, orderedIds: readonly string[], current: readonly MyCategory[]): Promise<void> {
  const byId = new Map(current.map(category => [category.id, category]))
  const changes = orderedIds.flatMap((id, index) => (byId.get(id) && byId.get(id)?.sortOrder !== index ? [{ id, index }] : []))
  const results = await Promise.all(changes.map(({ id, index }) => supabase.from('categories').update({ sort_order: index }).eq('id', id)))
  const failed = results.find(result => result.error)
  if (failed?.error) throw failed.error
}

/** Ajoute les catégories suggérées qui manquent (par clé), à la suite des siennes. */
export async function addSuggestedCategories(supabase: Client, ownerId: string, existing: readonly MyCategory[]): Promise<number> {
  const taken = new Set(existing.map(category => category.slug))
  const missing = SUGGESTED_CATEGORIES.filter(suggestion => !taken.has(suggestion.slug))
  if (missing.length === 0 || existing.length + missing.length > MAX_CATEGORIES) return 0
  const start = existing.reduce((max, category) => Math.max(max, category.sortOrder), -1) + 1
  const { error } = await supabase.from('categories').upsert(
    missing.map((suggestion, index) => ({
      owner_id: ownerId,
      slug: suggestion.slug,
      name_fr: suggestion.nameFr,
      name_en: suggestion.nameEn,
      icon: suggestion.icon,
      sort_order: start + index
    })),
    { onConflict: 'owner_id,slug', ignoreDuplicates: true }
  )
  if (error) throw error
  return missing.length
}
