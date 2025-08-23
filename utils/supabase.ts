import { createClient } from '@supabase/supabase-js'
import { config, validateConfig } from './config'

// Valider la configuration au démarrage
validateConfig()

export const supabase = createClient(config.supabase.url, config.supabase.anonKey)

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
