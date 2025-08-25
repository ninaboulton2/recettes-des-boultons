import { createClient } from '@supabase/supabase-js'

// Configuration Supabase directe depuis les variables d'environnement
// Note: Ces variables doivent être accessibles côté client
export const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_ANON_KEY || ''
)

// Types pour les recettes
export interface Recipe {
  id: string
  title: string
  description: string
  category: string
  ingredients: Array<{
    name: string
    amount?: string | number
    unit?: string
  }>
  instructions: string[]
  prepTime: number | string
  cookTime?: number
  servings: number
  image?: string
  tags: string[]
  favorite: boolean
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface RecipesData {
  recipes: Recipe[]
}
