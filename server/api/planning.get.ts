import { defineEventHandler, getQuery, createError } from 'h3'

export default defineEventHandler(async (event) => {
  try {
    const { supabase, user } = await requireUser(event)

    const query = getQuery(event)
    const { dateString } = query
    const userId = user.id

    let planningQuery = supabase
      .from('planning')
      .select(`
        *,
        recipe:recipes(*)
      `)
      .order('date_string', { ascending: true })
      .order('meal_type', { ascending: true })

    // Filtrer par date si spécifiée
    if (dateString) {
      planningQuery = planningQuery.eq('date_string', dateString)
    }

    // Filtrer par utilisateur si spécifié
    if (userId) {
      planningQuery = planningQuery.eq('user_id', userId)
    }

    const { data, error } = await planningQuery

    if (error) {
      console.error('Erreur Supabase lors de la récupération du planning:', error)
      throw createError({
        statusCode: 500,
        statusMessage: `Erreur lors de la récupération du planning: ${error.message}`
      })
    }

    // Récupérer les notes du planning
    let notesQuery = supabase
      .from('planning_notes')
      .select('*')
      .order('date_string', { ascending: true })

    if (dateString) {
      notesQuery = notesQuery.eq('date_string', dateString)
    }

    if (userId) {
      notesQuery = notesQuery.eq('user_id', userId)
    }

    const { data: notesData, error: notesError } = await notesQuery

    if (notesError) {
      console.error('Erreur Supabase lors de la récupération des notes:', notesError)
      // On continue sans les notes en cas d'erreur
    }

    // Formater les données pour correspondre à l'ancienne structure
    const formattedPlanning = data.map(meal => ({
      id: meal.id,
      dateString: meal.date_string,
      mealType: meal.meal_type,
      recipeId: meal.recipe_id,
      customTitle: meal.custom_title,
      userId: meal.user_id,
      createdAt: meal.created_at,
      updatedAt: meal.updated_at,
      // Inclure les détails de la recette ou le titre personnalisé
      recipe: meal.recipe ? {
        id: meal.recipe.id,
        title: meal.recipe.title,
        description: meal.recipe.description,
        category: meal.recipe.category,
        ingredients: meal.recipe.ingredients,
        instructions: meal.recipe.instructions,
        prepTime: meal.recipe.prep_time,
        cookTime: meal.recipe.cook_time,
        servings: meal.recipe.servings,
        image: meal.recipe.image,
        tags: meal.recipe.tags || [],
        notes: meal.recipe.notes || '',
        createdAt: meal.recipe.created_at,
        updatedAt: meal.recipe.updated_at
      } : (meal.custom_title ? {
        // Objet recette factice pour les repas personnalisés
        id: `custom-${meal.id}`,
        title: meal.custom_title,
        description: 'Repas personnalisé',
        category: 'Personnalisé',
        ingredients: [],
        instructions: [],
        prepTime: 0,
        cookTime: 0,
        servings: 1,
        image: '/images/custom-meal.jpg',
        tags: ['personnalisé'],
        notes: '',
        createdAt: meal.created_at,
        updatedAt: meal.updated_at
      } : null)
    }))

    // Grouper par date et type de repas
    const groupedPlanning = formattedPlanning.reduce((acc, meal) => {
      if (!acc[meal.dateString]) {
        acc[meal.dateString] = { lunch: [], dinner: [] }
      }
      
      if (meal.mealType === 'lunch') {
        acc[meal.dateString].lunch.push(meal)
      } else if (meal.mealType === 'dinner') {
        acc[meal.dateString].dinner.push(meal)
      }
      
      return acc
    }, {})

    // Ajouter les notes au planning groupé
    if (notesData && !notesError) {
      
      // D'abord, créer des entrées vides pour toutes les dates qui ont des notes
      notesData.forEach(note => {
        if (!groupedPlanning[note.date_string]) {
          groupedPlanning[note.date_string] = { lunch: [], dinner: [] }
          console.log('🆕 Entrée vide créée pour la date:', note.date_string)
        }
      })
      
      // Ensuite, traiter chaque note
      notesData.forEach(note => {
        
        if (groupedPlanning[note.date_string]) {
          if (note.note_type === 'day') {
            groupedPlanning[note.date_string].notes = note.content
          } else if (note.note_type === 'lunch') {
            groupedPlanning[note.date_string].lunchGroupNote = note.content
          } else if (note.note_type === 'dinner') {
            groupedPlanning[note.date_string].dinnerGroupNote = note.content
          }
        } else {
          console.log('⚠️ Date non trouvée dans le planning pour la note:', note.date_string)
        }
      })
    }

    return {
      success: true,
      planning: groupedPlanning,
      count: formattedPlanning.length
    }

  } catch (error: any) {
    console.error('Erreur lors de la récupération du planning:', error)
    
    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: `Erreur interne du serveur: ${error.message || 'Erreur inconnue'}`
    })
  }
})
