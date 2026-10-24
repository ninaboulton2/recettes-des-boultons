// ============================================================================
//  FICHIER GÉNÉRÉ — NE PAS ÉDITER À LA MAIN.
//  Régénérer depuis la base locale (schéma prod + migrations 0003 → 0023) :
//    npx supabase gen types typescript --local > shared/types/database.ts
//  puis replacer cet en-tête. (Les fonctions de 0021 et 0023 ont été ajoutées à la main : à revérifier à la régénération.) Après application des migrations en prod :
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
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"duration_ms"?: number | null,"estimated_cost_usd"?: number | null,"feature"?: string,"id"?: string,"input_tokens"?: number,"model": string,"output_tokens"?: number,"provider": string,"status": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"duration_ms"?: number | null,"estimated_cost_usd"?: number | null,"feature"?: string,"id"?: string,"input_tokens"?: number,"model"?: string,"output_tokens"?: number,"provider"?: string,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"categories": {
                  Row: {
                    "color": string | null,"created_at": string,"icon": string | null,"id": string,"name_en": string | null,"name_fr": string | null,"owner_id": string,"slug": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "color"?: string | null,"created_at"?: string,"icon"?: string | null,"id"?: string,"name_en"?: string | null,"name_fr"?: string | null,"owner_id": string,"slug": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "color"?: string | null,"created_at"?: string,"icon"?: string | null,"id"?: string,"name_en"?: string | null,"name_fr"?: string | null,"owner_id"?: string,"slug"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                    
                  ]
                },
                "cookbook_entries": {
                  Row: {
                    "category_id": string | null,"created_at": string,"recipe_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category_id"?: string | null,"created_at"?: string,"recipe_id": string,"user_id": string
                  }
                  Update: {
                    "category_id"?: string | null,"created_at"?: string,"recipe_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cookbook_entries_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cookbook_entries_recipe_id_fkey"
      columns: ["recipe_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id"]
    }
                  ]
                },"dismissed_prompts": {
                  Row: {
                    "created_at": string,"kind": string,"target_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"kind": string,"target_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"kind"?: string,"target_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                    
                  ]
                },"favorites": {
                  Row: {
                    "created_at": string | null,"id": string,"recipe_id": string,"updated_at": string | null,"user_id": string
                  }
                  ComputedFields: never
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
                },"friendships": {
                  Row: {
                    "addressee_id": string,"created_at": string,"id": string,"requester_id": string,"responded_at": string | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "addressee_id": string,"created_at"?: string,"id"?: string,"requester_id": string,"responded_at"?: string | null,"status"?: string
                  }
                  Update: {
                    "addressee_id"?: string,"created_at"?: string,"id"?: string,"requester_id"?: string,"responded_at"?: string | null,"status"?: string
                  }
                  Relationships: [
                    
                    
                  ]
                },
                "group_members": {
                  Row: {
                    "created_at": string,"group_id": string,"role": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"group_id": string,"role"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"group_id"?: string,"role"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "group_members_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    }
                  ]
                },
                "groups": {
                  Row: {
                    "created_at": string,"created_by": string,"id": string,"name": string,"theme": NonNullable<Json>,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by": string,"id"?: string,"name": string,"theme"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"id"?: string,"name"?: string,"theme"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Relationships: [
                    
                    
                  ]
                },"instructions": {
                  Row: {
                    "content": string,"created_at": string | null,"id": string,"order_index": number,"recipe_id": string,"section_id": string | null,"updated_at": string | null
                  }
                  ComputedFields: never
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
                },"instructions_backup_cleanup": {
                  Row: {
                    "backed_up_at": string | null,"content": string | null,"correction": string | null,"created_at": string | null,"id": string | null,"order_index": number | null,"recipe_id": string | null,"section_id": string | null,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "backed_up_at"?: string | null,"content"?: string | null,"correction"?: string | null,"created_at"?: string | null,"id"?: string | null,"order_index"?: number | null,"recipe_id"?: string | null,"section_id"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "backed_up_at"?: string | null,"content"?: string | null,"correction"?: string | null,"created_at"?: string | null,"id"?: string | null,"order_index"?: number | null,"recipe_id"?: string | null,"section_id"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"invitations": {
                  Row: {
                    "created_at": string,"expires_at": string,"group_id": string | null,"id": string,"inviter_id": string,"kind": string,"responded_at": string | null,"status": string,"target_email": string | null,"target_user_id": string | null,"token_hash": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"expires_at"?: string,"group_id"?: string | null,"id"?: string,"inviter_id": string,"kind": string,"responded_at"?: string | null,"status"?: string,"target_email"?: string | null,"target_user_id"?: string | null,"token_hash"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"expires_at"?: string,"group_id"?: string | null,"id"?: string,"inviter_id"?: string,"kind"?: string,"responded_at"?: string | null,"status"?: string,"target_email"?: string | null,"target_user_id"?: string | null,"token_hash"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "invitations_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    }
                  ]
                },
                "notifications": {
                  Row: {
                    "created_at": string,"id": string,"payload": NonNullable<Json>,"read_at": string | null,"type": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"payload"?: NonNullable<Json>,"read_at"?: string | null,"type": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"payload"?: NonNullable<Json>,"read_at"?: string | null,"type"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                    
                  ]
                },"planning": {
                  Row: {
                    "created_at": string | null,"custom_title": string | null,"date_string": string,"id": string,"meal_type": string,"recipe_id": string | null,"updated_at": string | null,"user_id": string
                  }
                  ComputedFields: never
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
                  ComputedFields: never
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
                    "active_theme_group_id": string | null,"cookbook_title": string | null,"created_at": string | null,"discoverable": boolean,"display_name": string | null,"email": string,"id": string,"language": string | null,"name": string | null,"notifications": boolean | null,"onboarded_at": string | null,"role": string | null,"theme": string | null,"theme_settings": Json | null,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active_theme_group_id"?: string | null,"cookbook_title"?: string | null,"created_at"?: string | null,"discoverable"?: boolean,"display_name"?: string | null,"email": string,"id": string,"language"?: string | null,"name"?: string | null,"notifications"?: boolean | null,"onboarded_at"?: string | null,"role"?: string | null,"theme"?: string | null,"theme_settings"?: Json | null,"updated_at"?: string | null
                  }
                  Update: {
                    "active_theme_group_id"?: string | null,"cookbook_title"?: string | null,"created_at"?: string | null,"discoverable"?: boolean,"display_name"?: string | null,"email"?: string,"id"?: string,"language"?: string | null,"name"?: string | null,"notifications"?: boolean | null,"onboarded_at"?: string | null,"role"?: string | null,"theme"?: string | null,"theme_settings"?: Json | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_active_theme_group_id_fkey"
      columns: ["active_theme_group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    }
                  ]
                },"recipe_grants": {
                  Row: {
                    "created_at": string,"granted_by": string,"grantee_group_id": string | null,"grantee_user_id": string | null,"id": string,"origin": string,"permission": string,"recipe_id": string,"source_grant_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"granted_by": string,"grantee_group_id"?: string | null,"grantee_user_id"?: string | null,"id"?: string,"origin"?: string,"permission": string,"recipe_id": string,"source_grant_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"granted_by"?: string,"grantee_group_id"?: string | null,"grantee_user_id"?: string | null,"id"?: string,"origin"?: string,"permission"?: string,"recipe_id"?: string,"source_grant_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_grants_grantee_group_id_fkey"
      columns: ["grantee_group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recipe_grants_recipe_id_fkey"
      columns: ["recipe_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recipe_grants_source_grant_id_fkey"
      columns: ["source_grant_id"]
isOneToOne: false
      referencedRelation: "recipe_grants"
      referencedColumns: ["id"]
    }
                  ]
                },"recipe_ingredients": {
                  Row: {
                    "amount": string | null,"amount_num": number | null,"created_at": string | null,"id": string,"name": string,"optional": boolean | null,"order_index": number,"recipe_id": string,"section_id": string | null,"unit": string | null,"unit_code": string | null,"updated_at": string | null
                  }
                  ComputedFields: never
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
                },"recipe_ingredients_backup_cleanup": {
                  Row: {
                    "amount": string | null,"amount_num": number | null,"backed_up_at": string | null,"correction": string | null,"created_at": string | null,"id": string | null,"name": string | null,"optional": boolean | null,"order_index": number | null,"recipe_id": string | null,"section_id": string | null,"unit": string | null,"unit_code": string | null,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount"?: string | null,"amount_num"?: number | null,"backed_up_at"?: string | null,"correction"?: string | null,"created_at"?: string | null,"id"?: string | null,"name"?: string | null,"optional"?: boolean | null,"order_index"?: number | null,"recipe_id"?: string | null,"section_id"?: string | null,"unit"?: string | null,"unit_code"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "amount"?: string | null,"amount_num"?: number | null,"backed_up_at"?: string | null,"correction"?: string | null,"created_at"?: string | null,"id"?: string | null,"name"?: string | null,"optional"?: boolean | null,"order_index"?: number | null,"recipe_id"?: string | null,"section_id"?: string | null,"unit"?: string | null,"unit_code"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"recipe_sections": {
                  Row: {
                    "created_at": string | null,"id": string,"name": string,"order_index": number,"recipe_id": string,"type": string,"updated_at": string | null
                  }
                  ComputedFields: never
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
                },"recipe_sections_backup_cleanup": {
                  Row: {
                    "backed_up_at": string | null,"correction": string | null,"created_at": string | null,"id": string | null,"name": string | null,"order_index": number | null,"recipe_id": string | null,"type": string | null,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "backed_up_at"?: string | null,"correction"?: string | null,"created_at"?: string | null,"id"?: string | null,"name"?: string | null,"order_index"?: number | null,"recipe_id"?: string | null,"type"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "backed_up_at"?: string | null,"correction"?: string | null,"created_at"?: string | null,"id"?: string | null,"name"?: string | null,"order_index"?: number | null,"recipe_id"?: string | null,"type"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"recipe_share_links": {
                  Row: {
                    "created_at": string,"recipe_id": string,"token": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"recipe_id": string,"token"?: string
                  }
                  Update: {
                    "created_at"?: string,"recipe_id"?: string,"token"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_share_links_recipe_id_fkey"
      columns: ["recipe_id"]
isOneToOne: true
      referencedRelation: "recipes"
      referencedColumns: ["id"]
    }
                  ]
                },"recipe_translations": {
                  Row: {
                    "content": NonNullable<Json>,"description": string | null,"locale": string,"model": string | null,"notes": string | null,"recipe_id": string,"search": unknown,"source_hash": string,"stale": boolean,"tags": (string)[],"title": string,"translated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content"?: NonNullable<Json>,"description"?: string | null,"locale": string,"model"?: string | null,"notes"?: string | null,"recipe_id": string,"search"?: never,"source_hash": string,"stale"?: boolean,"tags"?: (string)[],"title": string,"translated_at"?: string
                  }
                  Update: {
                    "content"?: NonNullable<Json>,"description"?: string | null,"locale"?: string,"model"?: string | null,"notes"?: string | null,"recipe_id"?: string,"search"?: never,"source_hash"?: string,"stale"?: boolean,"tags"?: (string)[],"title"?: string,"translated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_translations_recipe_id_fkey"
      columns: ["recipe_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id"]
    }
                  ]
                },"recipes": {
                  Row: {
                    "category": string,"category_id": string | null,"cook_time": number | null,"copied_from": string | null,"created_at": string | null,"description": string | null,"id": string,"image": string | null,"lang": string,"notes": string | null,"owner_id": string | null,"photo_path": string | null,"prep_time": number | null,"search": unknown,"servings": number | null,"tags": (string)[] | null,"title": string,"updated_at": string | null,"visibility": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category": string,"category_id"?: string | null,"cook_time"?: number | null,"copied_from"?: string | null,"created_at"?: string | null,"description"?: string | null,"id"?: string,"image"?: string | null,"lang"?: string,"notes"?: string | null,"owner_id"?: string | null,"photo_path"?: string | null,"prep_time"?: number | null,"search"?: never,"servings"?: number | null,"tags"?: (string)[] | null,"title": string,"updated_at"?: string | null,"visibility"?: string
                  }
                  Update: {
                    "category"?: string,"category_id"?: string | null,"cook_time"?: number | null,"copied_from"?: string | null,"created_at"?: string | null,"description"?: string | null,"id"?: string,"image"?: string | null,"lang"?: string,"notes"?: string | null,"owner_id"?: string | null,"photo_path"?: string | null,"prep_time"?: number | null,"search"?: never,"servings"?: number | null,"tags"?: (string)[] | null,"title"?: string,"updated_at"?: string | null,"visibility"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipes_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recipes_copied_from_fkey"
      columns: ["copied_from"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id"]
    }
                  ]
                },"reports": {
                  Row: {
                    "created_at": string,"details": string | null,"handled_at": string | null,"id": string,"reason": string,"recipe_id": string | null,"reporter_id": string | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"details"?: string | null,"handled_at"?: string | null,"id"?: string,"reason": string,"recipe_id"?: string | null,"reporter_id"?: string | null,"status"?: string
                  }
                  Update: {
                    "created_at"?: string,"details"?: string | null,"handled_at"?: string | null,"id"?: string,"reason"?: string,"recipe_id"?: string | null,"reporter_id"?: string | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reports_recipe_id_fkey"
      columns: ["recipe_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id"]
    }
                  ]
                },"shopping_items": {
                  Row: {
                    "amount": string | null,"amount_num": number | null,"created_at": string | null,"id": string,"is_checked": boolean | null,"list_id": string,"name": string,"recipe_id": string | null,"unit": string | null,"unit_code": string | null,"updated_at": string | null
                  }
                  ComputedFields: never
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
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string | null,"id"?: string,"name"?: string,"updated_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string | null,"id"?: string,"name"?: string,"updated_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"system_alerts": {
                  Row: {
                    "count": number,"created_at": string,"first_seen": string | null,"key": string,"last_seen": string | null,"notified_at": string | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "count"?: number,"created_at"?: string,"first_seen"?: string | null,"key": string,"last_seen"?: string | null,"notified_at"?: string | null,"status"?: string
                  }
                  Update: {
                    "count"?: number,"created_at"?: string,"first_seen"?: string | null,"key"?: string,"last_seen"?: string | null,"notified_at"?: string | null,"status"?: string
                  }
                  Relationships: [
                    
                    
                  ]
                },"unit_aliases": {
                  Row: {
                    "alias": string,"code": string
                  }
                  ComputedFields: never
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
                    "abbr": string,"abbr_en": string,"code": string,"kind": string,"label_en": string,"label_fr": string,"sort_order": number,"to_base": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "abbr": string,"abbr_en": string,"code": string,"kind": string,"label_en": string,"label_fr": string,"sort_order"?: number,"to_base"?: number | null
                  }
                  Update: {
                    "abbr"?: string,"abbr_en"?: string,"code"?: string,"kind"?: string,"label_en"?: string,"label_fr"?: string,"sort_order"?: number,"to_base"?: number | null
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "account_deletion_blockers":
{ Args: never; Returns: {
              "group_id": string,"group_name": string,"other_member_count": number
            }[]
                           },
"add_author_recipes_to_cookbook":
{ Args: { "p_author": string }; Returns: number
                           },
"add_recipe_to_list":
{ Args: { "p_list_id": string,"p_locale"?: string,"p_recipe_id": string,"p_section_ids"?: (string)[],"p_servings_factor"?: number }; Returns: {
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
"add_to_cookbook":
{ Args: { "p_category"?: string,"p_recipe": string }; Returns: boolean
                           },
"cancel_friend_request":
{ Args: { "p_id": string }; Returns: boolean
                           },
"cancel_group_invitation":
{ Args: { "p_id": string }; Returns: boolean
                           },
"check_ai_quota":
{ Args: { "p_max_per_day": number }; Returns: boolean
                           },
"claim_shared_recipe":
{ Args: { "p_token": string }; Returns: string
                           },
"copy_recipe":
{ Args: { "p_source": string }; Returns: string
                           },
"create_group":
{ Args: { "p_name": string }; Returns: string
                           },
"create_invite_link":
{ Args: { "p_group": string }; Returns: {
              "expires_at": string,"invitation_id": string,"token": string
            }[]
                           },
"create_share_link":
{ Args: { "p_recipe": string }; Returns: string
                           },
"custom_access_token_hook":
{ Args: { "event": Json }; Returns: Json
                           },
"delete_group":
{ Args: { "p_group": string }; Returns: undefined
                           },
"delete_recipe":
{ Args: { "p_id": string }; Returns: undefined
                           },
"dismiss_prompt":
{ Args: { "p_kind": string,"p_target": string }; Returns: undefined
                           },
"export_my_data":
{ Args: never; Returns: Json
                           },
"fold_text":
{ Args: { "p": string }; Returns: string
                           },
"format_amount":
{ Args: { "p": number }; Returns: string
                           },
"get_public_profiles":
{ Args: { "p_ids": (string)[] }; Returns: {
              "cookbook_title": string,"display_name": string,"id": string
            }[]
                           },
"get_shared_recipe":
{ Args: { "p_locale"?: string,"p_token": string }; Returns: Json
                           },
"get_user_profile":
{ Args: { "p_user": string }; Returns: {
              "common_groups": Json,"cookbook_title": string,"display_name": string,"friendship_id": string,"friendship_status": string,"is_self": boolean,"readable_recipe_count": number,"user_id": string
            }[]
                           },
"grant_recipe":
{ Args: { "p_grantee_group"?: string,"p_grantee_user"?: string,"p_permission"?: string,"p_recipe": string }; Returns: string
                           },
"immutable_array_to_string":
{ Args: { "p": (string)[] }; Returns: string
                           },
"immutable_unaccent":
{ Args: { "p": string }; Returns: string
                           },
"invite_to_group":
{ Args: { "p_group": string,"p_user": string }; Returns: string
                           },
"leave_group":
{ Args: { "p_group": string }; Returns: undefined
                           },
"list_author_recipes":
{ Args: { "p_author": string,"p_limit"?: number,"p_offset"?: number }; Returns: {
              "author_id": string,"author_name": string,"category": string,"cook_time": number,"created_at": string,"description": string,"id": string,"image": string,"in_cookbook": boolean,"lang": string,"notes": string,"permission": string,"photo_path": string,"prep_time": number,"servings": number,"tags": (string)[],"title": string,"total_count": number,"translation": Json,"updated_at": string
            }[]
                           },
"list_cookbook":
{ Args: { "p_category"?: string,"p_limit"?: number,"p_offset"?: number,"p_query"?: string }; Returns: {
              "added_at": string,"author_id": string,"author_name": string,"category": string,"category_id": string,"cook_time": number,"created_at": string,"description": string,"id": string,"image": string,"lang": string,"notes": string,"permission": string,"photo_path": string,"prep_time": number,"relation": string,"servings": number,"tags": (string)[],"title": string,"total_count": number,"translation": Json,"updated_at": string
            }[]
                           },
"list_friend_requests":
{ Args: never; Returns: {
              "created_at": string,"direction": string,"display_name": string,"friendship_id": string,"retry_after": string,"status": string,"user_id": string
            }[]
                           },
"list_friends":
{ Args: never; Returns: {
              "cookbook_title": string,"display_name": string,"friendship_id": string,"since": string,"user_id": string
            }[]
                           },
"list_group_invitations":
{ Args: never; Returns: {
              "channel": string,"created_at": string,"direction": string,"display_name": string,"expires_at": string,"group_id": string,"group_name": string,"invitation_id": string,"user_id": string
            }[]
                           },
"list_group_members":
{ Args: { "p_group": string }; Returns: {
              "display_name": string,"joined_at": string,"role": string,"user_id": string
            }[]
                           },
"list_my_groups":
{ Args: never; Returns: {
              "created_at": string,"creator_name": string,"group_id": string,"joined_at": string,"member_count": number,"name": string,"role": string,"theme": Json
            }[]
                           },
"list_notifications":
{ Args: { "p_before"?: string,"p_limit"?: number }; Returns: {
              "created_at": string,"id": string,"payload": Json,"read_at": string,"type": string
            }[]
                           },
"list_recipe_grants":
{ Args: { "p_recipe": string }; Returns: {
              "created_at": string,"grant_id": string,"granted_by": string,"granted_by_name": string,"grantee_group_id": string,"grantee_name": string,"grantee_user_id": string,"origin": string,"permission": string,"source_grant_id": string
            }[]
                           },
"list_shared_with_me":
{ Args: { "p_limit"?: number,"p_offset"?: number }; Returns: {
              "author_id": string,"author_name": string,"category": string,"cook_time": number,"created_at": string,"description": string,"id": string,"image": string,"lang": string,"notes": string,"permission": string,"photo_path": string,"prep_time": number,"servings": number,"tags": (string)[],"title": string,"total_count": number,"translation": Json,"updated_at": string,"via": string
            }[]
                           },
"mark_notifications_read":
{ Args: { "p_ids"?: (string)[] }; Returns: number
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
"pending_prompts":
{ Args: { "p_limit"?: number,"p_since"?: string }; Returns: {
              "author_id": string,"author_name": string,"created_at": string,"kind": string,"recipe_count": number,"recipe_id": string,"target_id": string,"title": string
            }[]
                           },
"prepare_account_deletion":
{ Args: { "p_user": string }; Returns: number
                           },
"recipe_usage":
{ Args: { "p_recipe": string }; Returns: {
              "cookbook_count": number,"copy_count": number
            }[]
                           },
"redeem_invite_link":
{ Args: { "p_token": string }; Returns: string
                           },
"remove_friend":
{ Args: { "p_user": string }; Returns: boolean
                           },
"remove_from_cookbook":
{ Args: { "p_recipe": string }; Returns: boolean
                           },
"remove_group_member":
{ Args: { "p_group": string,"p_user": string }; Returns: boolean
                           },
"rename_group":
{ Args: { "p_group": string,"p_name": string }; Returns: undefined
                           },
"reshare_recipe":
{ Args: { "p_grantee_group"?: string,"p_grantee_user"?: string,"p_permission"?: string,"p_recipe": string }; Returns: string
                           },
"respond_friend_request":
{ Args: { "p_accept": boolean,"p_id": string }; Returns: string
                           },
"respond_group_invitation":
{ Args: { "p_accept": boolean,"p_id": string }; Returns: string
                           },
"revoke_recipe_grant":
{ Args: { "p_grant_id": string }; Returns: boolean
                           },
"revoke_share_link":
{ Args: { "p_recipe": string }; Returns: boolean
                           },
"save_recipe":
{ Args: { "payload": Json }; Returns: string
                           },
"save_recipe_translation":
{ Args: { "p_lang": string,"p_recipe_id": string,"p_translation": Json }; Returns: undefined
                           },
"search_recipes":
{ Args: { "p_category"?: string,"p_limit"?: number,"p_offset"?: number,"p_query"?: string,"p_tags"?: (string)[] }; Returns: {
              "category": string,"cook_time": number,"created_at": string,"description": string,"id": string,"image": string,"lang": string,"notes": string,"photo_path": string,"prep_time": number,"servings": number,"tags": (string)[],"title": string,"total_count": number,"translation": Json,"updated_at": string
            }[]
                           },
"search_users":
{ Args: { "p_query": string }; Returns: {
              "display_name": string,"id": string
            }[]
                           },
"send_friend_request":
{ Args: { "p_user": string }; Returns: string
                           },
"transfer_group_ownership":
{ Args: { "p_group": string,"p_new_creator": string }; Returns: undefined
                           },
"unread_notifications_count":
{ Args: never; Returns: number
                           },
"update_group_theme":
{ Args: { "p_group": string,"p_theme": Json }; Returns: undefined
                           },
"update_my_profile":
{ Args: { "p_active_theme_group_id"?: string,"p_complete_onboarding"?: boolean,"p_cookbook_title"?: string,"p_discoverable"?: boolean,"p_display_name"?: string,"p_personal_theme"?: boolean,"p_theme_settings"?: Json }; Returns: {
              "active_theme_group_id": string,"cookbook_title": string,"discoverable": boolean,"display_name": string,"onboarded_at": string,"theme_settings": Json
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
