import { defineEventHandler, readBody, createError } from 'h3'

export default defineEventHandler(async (event) => {
  try {
    const { supabase, user } = await requireUser(event)

    const body = await readBody(event)
    const { name } = body
    const userId = user.id

    if (!name) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Nom de la liste requis'
      })
    }

    // Insérer la nouvelle liste
    const { data, error } = await supabase
      .from('shopping_lists')
      .insert({
        name,
        user_id: userId
      })
      .select()
      .single()

    if (error) {
      console.error('Erreur Supabase lors de la création de la liste:', error)
      throw createError({
        statusCode: 500,
        statusMessage: `Erreur lors de la création: ${error.message}`
      })
    }

    // Formater la réponse
    const formattedList = {
      id: data.id,
      name: data.name,
      userId: data.user_id,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    }

    return {
      success: true,
      list: formattedList,
      message: `Liste "${name}" créée avec succès`
    }

  } catch (error: any) {
    console.error('Erreur lors de la création de la liste:', error)
    
    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: `Erreur interne du serveur: ${error.message || 'Erreur inconnue'}`
    })
  }
})
