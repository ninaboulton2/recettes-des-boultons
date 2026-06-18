import { defineEventHandler, getRouterParam, readBody, createError } from 'h3'

export default defineEventHandler(async (event) => {
  try {
    const { supabase } = await requireUser(event)

    const listId = getRouterParam(event, 'id')
    const body = await readBody(event)
    const { name } = body

    if (!listId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'ID de liste manquant'
      })
    }

    if (!name || name.trim() === '') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Nom de liste manquant'
      })
    }

    // Vérifier que la liste existe
    const { data: existingList, error: checkError } = await supabase
      .from('shopping_lists')
      .select('id, name')
      .eq('id', listId)
      .single()

    if (checkError || !existingList) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Liste non trouvée'
      })
    }

    // Mettre à jour le nom de la liste
    const { data, error } = await supabase
      .from('shopping_lists')
      .update({
        name: name.trim(),
        updated_at: new Date().toISOString()
      })
      .eq('id', listId)
      .select('*')
      .single()

    if (error) {
      console.error('Erreur Supabase lors de la mise à jour:', error)
      throw createError({
        statusCode: 500,
        statusMessage: `Erreur lors de la mise à jour: ${error.message}`
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
      message: 'Nom de liste mis à jour avec succès'
    }

  } catch (error: any) {
    console.error('Erreur lors de la mise à jour du nom de liste:', error)
    
    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: `Erreur interne du serveur: ${error.message || 'Erreur inconnue'}`
    })
  }
})
