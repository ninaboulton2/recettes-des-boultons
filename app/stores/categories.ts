import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'
import type { Database } from '#shared/types/database'
import type { CategoryFieldsInput } from '#shared/schemas/categories'
import { sortCategories, type MyCategory } from '#shared/utils/categories'
import { normalizeAccents } from '#shared/utils/text'
import {
  addSuggestedCategories,
  createCategory,
  deleteCategory,
  listMyCategories,
  reorderCategories,
  updateCategory
} from '~/composables/useMyCategories'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Mes catégories (v2), chargées une fois par session (rendu serveur compris) et tenues à jour par les écritures.
 * Les filtres de catégorie, la grille d'accueil et les cartes de recettes lisent ce store (`useCategories`).
 */
export const useCategoriesStore = defineStore('categories', () => {
  const supabase = useSupabaseClient<Database>()
  const authStore = useAuthStore()

  const items = shallowRef<MyCategory[]>([])
  const loadedFor = shallowRef<string | null>(null)
  const loading = shallowRef(false)

  const ownerId = () => authStore.currentUser?.id ?? null

  async function load(force = false): Promise<void> {
    const id = ownerId()
    if (!id) {
      items.value = []
      loadedFor.value = null
      return
    }
    if (!force && loadedFor.value === id) return
    loading.value = true
    try {
      items.value = await listMyCategories(supabase)
      loadedFor.value = id
    } catch (error) {
      console.error('Erreur lors du chargement des catégories :', error)
    } finally {
      loading.value = false
    }
  }

  const requireOwner = (): string => {
    const id = ownerId()
    if (!id) throw new Error('Connexion requise')
    return id
  }

  async function create(input: CategoryFieldsInput): Promise<MyCategory> {
    const created = await createCategory(supabase, requireOwner(), input, items.value)
    items.value = sortCategories([...items.value, created])
    return created
  }

  async function update(id: string, input: CategoryFieldsInput): Promise<MyCategory> {
    const updated = await updateCategory(supabase, id, input)
    items.value = sortCategories(items.value.map(category => category.id === id ? updated : category))
    return updated
  }

  async function remove(id: string): Promise<void> {
    await deleteCategory(supabase, id)
    items.value = items.value.filter(category => category.id !== id)
  }

  /** Déplace d'un rang vers le haut (-1) ou le bas (+1). */
  async function move(id: string, direction: -1 | 1): Promise<void> {
    const ids = items.value.map(category => category.id)
    const from = ids.indexOf(id)
    const to = from + direction
    if (from < 0 || to < 0 || to >= ids.length) return
    const [moved] = ids.splice(from, 1)
    ids.splice(to, 0, moved as string)
    await reorderCategories(supabase, ids, items.value)
    const rank = new Map(ids.map((value, index) => [value, index]))
    items.value = sortCategories(items.value.map(category => ({ ...category, sortOrder: rank.get(category.id) ?? category.sortOrder })))
  }

  async function addSuggestions(): Promise<number> {
    const added = await addSuggestedCategories(supabase, requireOwner(), items.value)
    if (added > 0) await load(true)
    return added
  }

  /**
   * Identifiant d'une catégorie à partir de ce qui traîne dans une URL ou une recette : identifiant, clé (`slug`)
   * ou ancien texte de la v1 (« desserts et gâteaux »). `null` si elle n'existe pas chez moi.
   */
  function resolveId(value: string | null | undefined): string | null {
    if (!value) return null
    if (UUID.test(value)) return items.value.some(category => category.id === value) ? value : null
    const key = normalizeAccents(value).trim().replace(/\s+/g, '_')
    return items.value.find(category => category.slug === value || category.slug === key)?.id ?? null
  }

  const byId = computed(() => new Map(items.value.map(category => [category.id, category])))

  return { items, loading, byId, load, create, update, remove, move, addSuggestions, resolveId }
})
