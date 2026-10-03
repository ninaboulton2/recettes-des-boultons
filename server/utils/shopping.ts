/**
 * Forme camelCase d'un article de liste de courses renvoyé par les endpoints
 * d'écriture (ligne `shopping_items`, y compris `amountNum` / `unitCode`).
 */

export interface ShoppingItemRow {
  id: string
  list_id: string
  name: string
  amount: string | null
  amount_num: number | string | null
  unit: string | null
  unit_code: string | null
  recipe_id: string | null
  is_checked: boolean | null
  created_at: string | null
  updated_at: string | null
}

export interface ShoppingItemDetail {
  id: string
  listId: string
  name: string
  amount: string | null
  amountNum: number | null
  unit: string | null
  unitCode: string | null
  recipeId: string | null
  isChecked: boolean
  createdAt: string | null
  updatedAt: string | null
}

export function mapShoppingItemRow(row: ShoppingItemRow): ShoppingItemDetail {
  const amountNum = row.amount_num === null || row.amount_num === undefined
    ? null
    : Number(row.amount_num)
  return {
    id: row.id,
    listId: row.list_id,
    name: row.name,
    amount: row.amount,
    amountNum: Number.isFinite(amountNum) ? amountNum : null,
    unit: row.unit,
    unitCode: row.unit_code,
    recipeId: row.recipe_id,
    isChecked: row.is_checked ?? false,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export interface ShoppingListRow {
  id: string
  user_id: string
  name: string
  created_at: string | null
  updated_at: string | null
}

export function mapShoppingListRow(row: ShoppingListRow) {
  return {
    id: row.id,
    name: row.name,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}
