// ============================================================================
//  FICHIER GÉNÉRÉ — NE PAS ÉDITER À LA MAIN.
//  Régénérer depuis la base locale (schéma prod + migrations 0003 → 0015) :
//    npx supabase gen types typescript --local > shared/types/database.ts
//  puis replacer cet en-tête. Après application des migrations en prod :
//    npx supabase gen types typescript --project-id tzlkabxcmmbwhpyvmato --schema public
// ============================================================================


export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "ai_usage": {
                  Row: {
                    "created_at": string,"duration_ms": number | null,"estimated_cost_usd": number | null,"feature": string,"id": string,"input_tokens": number,"model": string,"output_tokens": number,"provider": string,"status": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"duration_ms"?: number | null,"estimated_cost_usd"?: number | null,"feature"?: string,"id"?: string,"input_tokens"?: number,"model": string,"output_tokens"?: number,"provider": string,"status": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"duration_ms"?: number | null,"estimated_cost_usd"?: number | null,"feature"?: string,"id"?: string,"input_tokens"?: number,"model"?: string,"output_tokens"?: number,"provider"?: string,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"favorites": {
                  Row: {
                    "created_at": string | null,"id": string,"recipe_id": string,"updated_at": string | null,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string | null,"id"?: string,"recipe_id": string,"updated_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string | null,"id"?: string,"recipe_id"?: string,"updated_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "favorites_recipe_id_fkey"
      columns: ["recipe_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id"]
    }
                  ]
                },"instructions": {
                  Row: {
                    "content": string,"created_at": string | null,"id": string,"order_index": number,"recipe_id": string,"section_id": string | null,"updated_at": string | null
                  }
                  Insert: {
                    "content": string,"created_at"?: string | null,"id"?: string,"order_index"?: number,"recipe_id": string,"section_id"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "content"?: string,"created_at"?: string | null,"id"?: string,"order_index"?: number,"recipe_id"?: string,"section_id"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "instructions_recipe_id_fkey"
      columns: ["recipe_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "instructions_section_id_fkey"
      columns: ["section_id"]
isOneToOne: false
      referencedRelation: "recipe_sections"
      referencedColumns: ["id"]
    }
                  ]
                },"instructions_backup_20261003": {
                  Row: {
                    "content": string | null,"created_at": string | null,"id": string | null,"order_index": number | null,"recipe_id": string | null,"section_id": string | null,"updated_at": string | null
                  }
                  Insert: {
                    "content"?: string | null,"created_at"?: string | null,"id"?: string | null,"order_index"?: number | null,"recipe_id"?: string | null,"section_id"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "content"?: string | null,"created_at"?: string | null,"id"?: string | null,"order_index"?: number | null,"recipe_id"?: string | null,"section_id"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"instructions_backup_cleanup": {
                  Row: {
                    "backed_up_at": string | null,"content": string | null,"correction": string | null,"created_at": string | null,"id": string | null,"order_index": number | null,"recipe_id": string | null,"section_id": string | null,"updated_at": string | null
                  }
                  Insert: {
                    "backed_up_at"?: string | null,"content"?: string | null,"correction"?: string | null,"created_at"?: string | null,"id"?: string | null,"order_index"?: number | null,"recipe_id"?: string | null,"section_id"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "backed_up_at"?: string | null,"content"?: string | null,"correction"?: string | null,"created_at"?: string | null,"id"?: string | null,"order_index"?: number | null,"recipe_id"?: string | null,"section_id"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"instructions_orphans_20261003": {
                  Row: {
                    "archived_at": string | null,"content": string | null,"created_at": string | null,"id": string | null,"order_index": number | null,"recipe_id": string | null,"section_id": string | null,"updated_at": string | null
                  }
                  Insert: {
                    "archived_at"?: string | null,"content"?: string | null,"created_at"?: string | null,"id"?: string | null,"order_index"?: number | null,"recipe_id"?: string | null,"section_id"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "archived_at"?: string | null,"content"?: string | null,"created_at"?: string | null,"id"?: string | null,"order_index"?: number | null,"recipe_id"?: string | null,"section_id"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"planning": {
                  Row: {
                    "created_at": string | null,"custom_title": string | null,"date_string": string,"id": string,"meal_type": string,"recipe_id": string | null,"updated_at": string | null,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string | null,"custom_title"?: string | null,"date_string": string,"id"?: string,"meal_type": string,"recipe_id"?: string | null,"updated_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string | null,"custom_title"?: string | null,"date_string"?: string,"id"?: string,"meal_type"?: string,"recipe_id"?: string | null,"updated_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "planning_recipe_id_fkey"
      columns: ["recipe_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id"]
    }
                  ]
                },"planning_notes": {
                  Row: {
                    "content": string | null,"created_at": string | null,"date_string": string,"id": string,"note_type": string,"updated_at": string | null,"user_id": string | null
                  }
                  Insert: {
                    "content"?: string | null,"created_at"?: string | null,"date_string": string,"id"?: string,"note_type": string,"updated_at"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "content"?: string | null,"created_at"?: string | null,"date_string"?: string,"id"?: string,"note_type"?: string,"updated_at"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string | null,"email": string,"id": string,"language": string | null,"name": string | null,"notifications": boolean | null,"role": string | null,"theme": string | null,"updated_at": string | null
                  }
                  Insert: {
                    "created_at"?: string | null,"email": string,"id": string,"language"?: string | null,"name"?: string | null,"notifications"?: boolean | null,"role"?: string | null,"theme"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "created_at"?: string | null,"email"?: string,"id"?: string,"language"?: string | null,"name"?: string | null,"notifications"?: boolean | null,"role"?: string | null,"theme"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"recipe_ingredients": {
                  Row: {
                    "amount": string | null,"amount_num": number | null,"created_at": string | null,"id": string,"name": string,"optional": boolean | null,"order_index": number,"recipe_id": string,"section_id": string | null,"unit": string | null,"unit_code": string | null,"updated_at": string | null
                  }
                  Insert: {
                    "amount"?: string | null,"amount_num"?: number | null,"created_at"?: string | null,"id"?: string,"name": string,"optional"?: boolean | null,"order_index": number,"recipe_id": string,"section_id"?: string | null,"unit"?: string | null,"unit_code"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "amount"?: string | null,"amount_num"?: number | null,"created_at"?: string | null,"id"?: string,"name"?: string,"optional"?: boolean | null,"order_index"?: number,"recipe_id"?: string,"section_id"?: string | null,"unit"?: string | null,"unit_code"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_ingredients_recipe_id_fkey"
      columns: ["recipe_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recipe_ingredients_section_id_fkey"
      columns: ["section_id"]
isOneToOne: false
      referencedRelation: "recipe_sections"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recipe_ingredients_unit_code_fkey"
      columns: ["unit_code"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["code"]
    }
                  ]
                },"recipe_ingredients_backup_20261003": {
                  Row: {
                    "amount": string | null,"amount_num": number | null,"created_at": string | null,"id": string | null,"name": string | null,"optional": boolean | null,"order_index": number | null,"recipe_id": string | null,"section_id": string | null,"unit": string | null,"unit_code": string | null,"updated_at": string | null
                  }
                  Insert: {
                    "amount"?: string | null,"amount_num"?: number | null,"created_at"?: string | null,"id"?: string | null,"name"?: string | null,"optional"?: boolean | null,"order_index"?: number | null,"recipe_id"?: string | null,"section_id"?: string | null,"unit"?: string | null,"unit_code"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "amount"?: string | null,"amount_num"?: number | null,"created_at"?: string | null,"id"?: string | null,"name"?: string | null,"optional"?: boolean | null,"order_index"?: number | null,"recipe_id"?: string | null,"section_id"?: string | null,"unit"?: string | null,"unit_code"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"recipe_ingredients_backup_cleanup": {
                  Row: {
                    "amount": string | null,"amount_num": number | null,"backed_up_at": string | null,"correction": string | null,"created_at": string | null,"id": string | null,"name": string | null,"optional": boolean | null,"order_index": number | null,"recipe_id": string | null,"section_id": string | null,"unit": string | null,"unit_code": string | null,"updated_at": string | null
                  }
                  Insert: {
                    "amount"?: string | null,"amount_num"?: number | null,"backed_up_at"?: string | null,"correction"?: string | null,"created_at"?: string | null,"id"?: string | null,"name"?: string | null,"optional"?: boolean | null,"order_index"?: number | null,"recipe_id"?: string | null,"section_id"?: string | null,"unit"?: string | null,"unit_code"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "amount"?: string | null,"amount_num"?: number | null,"backed_up_at"?: string | null,"correction"?: string | null,"created_at"?: string | null,"id"?: string | null,"name"?: string | null,"optional"?: boolean | null,"order_index"?: number | null,"recipe_id"?: string | null,"section_id"?: string | null,"unit"?: string | null,"unit_code"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"recipe_ingredients_orphans_20261003": {
                  Row: {
                    "amount": string | null,"amount_num": number | null,"archived_at": string | null,"created_at": string | null,"id": string | null,"name": string | null,"optional": boolean | null,"order_index": number | null,"recipe_id": string | null,"section_id": string | null,"unit": string | null,"unit_code": string | null,"updated_at": string | null
                  }
                  Insert: {
                    "amount"?: string | null,"amount_num"?: number | null,"archived_at"?: string | null,"created_at"?: string | null,"id"?: string | null,"name"?: string | null,"optional"?: boolean | null,"order_index"?: number | null,"recipe_id"?: string | null,"section_id"?: string | null,"unit"?: string | null,"unit_code"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "amount"?: string | null,"amount_num"?: number | null,"archived_at"?: string | null,"created_at"?: string | null,"id"?: string | null,"name"?: string | null,"optional"?: boolean | null,"order_index"?: number | null,"recipe_id"?: string | null,"section_id"?: string | null,"unit"?: string | null,"unit_code"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"recipe_sections": {
                  Row: {
                    "created_at": string | null,"id": string,"name": string,"order_index": number,"recipe_id": string,"type": string,"updated_at": string | null
                  }
                  Insert: {
                    "created_at"?: string | null,"id"?: string,"name": string,"order_index"?: number,"recipe_id": string,"type": string,"updated_at"?: string | null
                  }
                  Update: {
                    "created_at"?: string | null,"id"?: string,"name"?: string,"order_index"?: number,"recipe_id"?: string,"type"?: string,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_sections_recipe_id_fkey"
      columns: ["recipe_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id"]
    }
                  ]
                },"recipe_sections_backup_20261003": {
                  Row: {
                    "created_at": string | null,"id": string | null,"name": string | null,"order_index": number | null,"recipe_id": string | null,"type": string | null,"updated_at": string | null
                  }
                  Insert: {
                    "created_at"?: string | null,"id"?: string | null,"name"?: string | null,"order_index"?: number | null,"recipe_id"?: string | null,"type"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "created_at"?: string | null,"id"?: string | null,"name"?: string | null,"order_index"?: number | null,"recipe_id"?: string | null,"type"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"recipe_sections_backup_cleanup": {
                  Row: {
                    "backed_up_at": string | null,"correction": string | null,"created_at": string | null,"id": string | null,"name": string | null,"order_index": number | null,"recipe_id": string | null,"type": string | null,"updated_at": string | null
                  }
                  Insert: {
                    "backed_up_at"?: string | null,"correction"?: string | null,"created_at"?: string | null,"id"?: string | null,"name"?: string | null,"order_index"?: number | null,"recipe_id"?: string | null,"type"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "backed_up_at"?: string | null,"correction"?: string | null,"created_at"?: string | null,"id"?: string | null,"name"?: string | null,"order_index"?: number | null,"recipe_id"?: string | null,"type"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"recipes": {
                  Row: {
                    "category": string,"cook_time": number | null,"created_at": string | null,"description": string | null,"id": string,"image": string | null,"notes": string | null,"photo_path": string | null,"prep_time": number | null,"search": unknown,"servings": number | null,"tags": (string)[] | null,"title": string,"updated_at": string | null
                  }
                  Insert: {
                    "category": string,"cook_time"?: number | null,"created_at"?: string | null,"description"?: string | null,"id"?: string,"image"?: string | null,"notes"?: string | null,"photo_path"?: string | null,"prep_time"?: number | null,"search"?: never,"servings"?: number | null,"tags"?: (string)[] | null,"title": string,"updated_at"?: string | null
                  }
                  Update: {
                    "category"?: string,"cook_time"?: number | null,"created_at"?: string | null,"description"?: string | null,"id"?: string,"image"?: string | null,"notes"?: string | null,"photo_path"?: string | null,"prep_time"?: number | null,"search"?: never,"servings"?: number | null,"tags"?: (string)[] | null,"title"?: string,"updated_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"recipes_backup_20261003": {
                  Row: {
                    "category": string | null,"cook_time": number | null,"created_at": string | null,"description": string | null,"id": string | null,"image": string | null,"ingredients": Json | null,"instructions": Json | null,"notes": string | null,"prep_time": number | null,"servings": number | null,"tags": (string)[] | null,"title": string | null,"updated_at": string | null
                  }
                  Insert: {
                    "category"?: string | null,"cook_time"?: number | null,"created_at"?: string | null,"description"?: string | null,"id"?: string | null,"image"?: string | null,"ingredients"?: Json | null,"instructions"?: Json | null,"notes"?: string | null,"prep_time"?: number | null,"servings"?: number | null,"tags"?: (string)[] | null,"title"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "category"?: string | null,"cook_time"?: number | null,"created_at"?: string | null,"description"?: string | null,"id"?: string | null,"image"?: string | null,"ingredients"?: Json | null,"instructions"?: Json | null,"notes"?: string | null,"prep_time"?: number | null,"servings"?: number | null,"tags"?: (string)[] | null,"title"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"shopping_items": {
                  Row: {
                    "amount": string | null,"amount_num": number | null,"created_at": string | null,"id": string,"is_checked": boolean | null,"list_id": string,"name": string,"recipe_id": string | null,"unit": string | null,"unit_code": string | null,"updated_at": string | null
                  }
                  Insert: {
                    "amount"?: string | null,"amount_num"?: number | null,"created_at"?: string | null,"id"?: string,"is_checked"?: boolean | null,"list_id": string,"name": string,"recipe_id"?: string | null,"unit"?: string | null,"unit_code"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "amount"?: string | null,"amount_num"?: number | null,"created_at"?: string | null,"id"?: string,"is_checked"?: boolean | null,"list_id"?: string,"name"?: string,"recipe_id"?: string | null,"unit"?: string | null,"unit_code"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "shopping_items_list_id_fkey"
      columns: ["list_id"]
isOneToOne: false
      referencedRelation: "shopping_lists"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shopping_items_recipe_id_fkey"
      columns: ["recipe_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shopping_items_unit_code_fkey"
      columns: ["unit_code"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["code"]
    }
                  ]
                },"shopping_lists": {
                  Row: {
                    "created_at": string | null,"id": string,"name": string,"updated_at": string | null,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string | null,"id"?: string,"name"?: string,"updated_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string | null,"id"?: string,"name"?: string,"updated_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"unit_aliases": {
                  Row: {
                    "alias": string,"code": string
                  }
                  Insert: {
                    "alias": string,"code": string
                  }
                  Update: {
                    "alias"?: string,"code"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "unit_aliases_code_fkey"
      columns: ["code"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["code"]
    }
                  ]
                },"units": {
                  Row: {
                    "abbr": string,"code": string,"kind": string,"label_en": string,"label_fr": string,"sort_order": number,"to_base": number | null
                  }
                  Insert: {
                    "abbr": string,"code": string,"kind": string,"label_en": string,"label_fr": string,"sort_order"?: number,"to_base"?: number | null
                  }
                  Update: {
                    "abbr"?: string,"code"?: string,"kind"?: string,"label_en"?: string,"label_fr"?: string,"sort_order"?: number,"to_base"?: number | null
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "add_recipe_to_list":
{ Args: { "p_list_id": string,"p_recipe_id": string,"p_section_ids"?: (string)[],"p_servings_factor"?: number }; Returns: {
              "amount": string | null,
"amount_num": number | null,
"created_at": string | null,
"id": string,
"is_checked": boolean | null,
"list_id": string,
"name": string,
"recipe_id": string | null,
"unit": string | null,
"unit_code": string | null,
"updated_at": string | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "shopping_items"
        isOneToOne: false
        isSetofReturn: true
      } },
"check_ai_quota":
{ Args: { "p_max_per_day": number }; Returns: boolean
                           },
"custom_access_token_hook":
{ Args: { "event": Json }; Returns: Json
                           },
"delete_recipe":
{ Args: { "p_id": string }; Returns: undefined
                           },
"fold_text":
{ Args: { "p": string }; Returns: string
                           },
"format_amount":
{ Args: { "p": number }; Returns: string
                           },
"immutable_array_to_string":
{ Args: { "p": (string)[] }; Returns: string
                           },
"immutable_unaccent":
{ Args: { "p": string }; Returns: string
                           },
"merge_shopping_item":
{ Args: { "p_amount_num": number,"p_list_id": string,"p_name": string,"p_recipe_id"?: string,"p_unit_code": string }; Returns: {
              "amount": string | null,
"amount_num": number | null,
"created_at": string | null,
"id": string,
"is_checked": boolean | null,
"list_id": string,
"name": string,
"recipe_id": string | null,
"unit": string | null,
"unit_code": string | null,
"updated_at": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "shopping_items"
        isOneToOne: true
        isSetofReturn: false
      } },
"normalize_unit":
{ Args: { "p": string }; Returns: string
                           },
"parse_amount":
{ Args: { "p": string }; Returns: number
                           },
"save_recipe":
{ Args: { "payload": Json }; Returns: string
                           },
"search_recipes":
{ Args: { "p_category"?: string,"p_limit"?: number,"p_offset"?: number,"p_query"?: string,"p_tags"?: (string)[] }; Returns: {
              "category": string,"cook_time": number,"created_at": string,"description": string,"id": string,"image": string,"notes": string,"photo_path": string,"prep_time": number,"servings": number,"tags": (string)[],"title": string,"total_count": number,"updated_at": string
            }[]
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
