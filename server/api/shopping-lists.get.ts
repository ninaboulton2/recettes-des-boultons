import { defineEventHandler, getQuery, createError } from 'h3'
import { supabase } from '~/utils/supabase'

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const { userId = null } = query

    let listsQuery = supabase
      .from('shopping_lists')
      .select(`
        *,
        items:shopping_items(*)
      `)
      .order('created_at', { ascending: false })

    // Filtrer par utilisateur si spécifié
    if (userId) {
      listsQuery = listsQuery.eq('user_id', userId)
    }

    const { data, error } = await listsQuery

    if (error) {
      console.error('Erreur Supabase lors de la récupération des listes:', error)
      throw createError({
        statusCode: 500,
        statusMessage: `Erreur lors de la récupération des listes: ${error.message}`
      })
    }

    // Formater les données pour correspondre à l'ancienne structure
    const formattedLists = data.map(list => ({
      id: list.id,
      name: list.name,
      userId: list.user_id,
      createdAt: list.created_at,
      updatedAt: list.updated_at,
      items: (list.items || []).map(item => ({
        id: item.id,
        name: item.name,
        amount: item.amount,
        unit: item.unit,
        recipeId: item.recipe_id,
        isChecked: item.is_checked,
        createdAt: item.created_at,
        updatedAt: item.updated_at
      }))
    }))

    return {
      success: true,
      lists: formattedLists,
      count: formattedLists.length
    }

  } catch (error: any) {
    console.error('Erreur lors de la récupération des listes:', error)
    
    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: `Erreur interne du serveur: ${error.message || 'Erreur inconnue'}`
    })
  }
})
