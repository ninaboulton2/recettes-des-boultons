export interface Recipe {
  id: string
  title: string
  description: string
  category: RecipeCategory
  ingredients: Ingredient[]
  instructions: string[]
  sections?: RecipeSection[]
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
  sectionId?: string
}

export interface Instruction {
  content: string
  orderIndex: number
  sectionId?: string
}

export interface RecipeSection {
  id: string
  recipeId: string
  name: string
  type: 'ingredients' | 'instructions' | 'mixed'
  orderIndex: number
  ingredients?: Ingredient[]
  instructions?: Instruction[]
  createdAt: string
  updatedAt: string
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
  user_id: string
  name: string
  items: ShoppingItem[]
  createdAt: Date
  updatedAt: Date
}

export interface ShoppingItem {
  id: string
  list_id: string
  name: string
  amount: number
  unit: string
  checked: boolean
  recipe_id?: string
}

export interface Favorite {
  id: string
  user_id: string
  recipe_id: string
  recipe?: Recipe
  created_at: string
  updated_at: string
}

export interface PlanningItem {
  id: string
  user_id: string
  date_string: string
  meal_type: 'lunch' | 'dinner'
  recipe_id?: string
  recipe?: Recipe
  custom_title?: string
  created_at: string
  updated_at: string
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

export interface Profile {
  id: string
  email: string
  name?: string
  role: 'admin' | 'user'
  language?: 'fr' | 'en'
  theme?: 'light' | 'dark'
  notifications?: boolean
  created_at: string
  updated_at: string
}

export interface User {
  id: string
  email: string
  name?: string
  role: 'admin' | 'user'
  language?: 'fr' | 'en'
  theme?: 'light' | 'dark'
  notifications?: boolean
  createdAt: string
  updatedAt?: string
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface SignUpCredentials {
  email: string
  name: string
  password: string
}

export interface AuthResponse {
  user: User
  token: string
}

export interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
} 