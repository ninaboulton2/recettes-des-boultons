export interface Recipe {
  id: string
  title: string
  description: string
  category: RecipeCategory
  ingredients: Ingredient[]
  instructions: string[]
  prepTime: number
  cookTime: number
  servings: number
  image: string
  tags: string[]
  favorite: boolean
  createdAt: string
  updatedAt: string
  notes: string
}

export interface Ingredient {
  name: string
  amount: number
  unit: string
  optional?: boolean
}

export type RecipeCategory = 
  | 'soupes'
  | 'entrees'
  | 'plats'
  | 'poissons'
  | 'viandes'
  | 'yaourts et fromages'
  | 'desserts et gâteaux'
  | 'boissons'

export interface Category {
  id: RecipeCategory
  name: string
  description: string
  image: string
  color: string
}

export interface ShoppingList {
  id: string
  name: string
  items: ShoppingItem[]
  createdAt: Date
  updatedAt: Date
}

export interface ShoppingItem {
  id: string
  name: string
  amount: number
  unit: string
  checked: boolean
  recipeId?: string
}

export interface WeeklyPlan {
  id: string
  weekStart: Date
  days: WeeklyDay[]
}

export interface WeeklyDay {
  day: string
  date: Date
  meals: {
    breakfast?: Recipe
    lunch?: Recipe
    dinner?: Recipe
  }
} 