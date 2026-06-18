import { defineEventHandler, readBody, createError } from 'h3'

export default defineEventHandler(async (event) => {
  try {
    const { supabase, user } = await requireUser(event)
    const userId = user.id

    const body = await readBody(event)
    const { listId, name, amount, unit, recipeId = null } = body

    if (!listId || !name) {
      throw createError({
        statusCode: 400,
        statusMessage: 'ID de liste et nom de l\'article requis'
      })
    }

    // Vérifier que la liste existe et appartient à l'utilisateur connecté
    const { data: list, error: listError } = await supabase
      .from('shopping_lists')
      .select('id, name, user_id')
      .eq('id', listId)
      .single()

    if (listError || !list) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Liste de courses non trouvée'
      })
    }

    // Vérifier que l'utilisateur est le propriétaire de la liste
    if (list.user_id !== userId) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Vous n\'êtes pas autorisé à ajouter des articles à cette liste'
      })
    }

    // Vérifier s'il existe déjà des items avec le même nom dans cette liste
    const { data: existingItems, error: checkError } = await supabase
      .from('shopping_items')
      .select('id, amount, unit')
      .eq('list_id', listId)
      .eq('name', name)

    if (checkError) {
      console.error('Erreur lors de la vérification des items existants:', checkError)
      throw createError({
        statusCode: 500,
        statusMessage: `Erreur lors de la vérification: ${checkError.message}`
      })
    }

    if (existingItems && existingItems.length > 0) {

      // Calculer la quantité totale
      const totalAmount = existingItems.reduce((sum, item) => {
        const itemAmount = parseFloat(item.amount) || 0
        return sum + itemAmount
      }, 0) + amount
            
      // Mettre à jour le premier item existant avec la nouvelle quantité totale
      const firstExistingItem = existingItems[0]
      
      const { error: updateError } = await supabase
        .from('shopping_items')
        .update({
          amount: totalAmount,
          unit: unit || firstExistingItem.unit,
          updated_at: new Date().toISOString()
        })
        .eq('id', firstExistingItem.id)

      if (updateError) {
        console.error('Erreur lors de la mise à jour de la quantité:', updateError)
        throw createError({
          statusCode: 500,
          statusMessage: `Erreur lors de la mise à jour: ${updateError.message}`
        })
      }

      // Supprimer les autres items avec le même nom (ils sont maintenant consolidés)
      for (let i = 1; i < existingItems.length; i++) {
        const itemToDelete = existingItems[i]
        const { error: deleteError } = await supabase
          .from('shopping_items')
          .delete()
          .eq('id', itemToDelete.id)
        
        if (deleteError) {
          console.warn(`⚠️ Erreur lors de la suppression de l'item ${itemToDelete.id}:`, deleteError)
        }
      }

      // Récupérer l'item mis à jour
      const { data: updatedItem, error: fetchError } = await supabase
        .from('shopping_items')
        .select('*')
        .eq('id', firstExistingItem.id)
        .single()

      if (fetchError) {
        throw createError({
          statusCode: 500,
          statusMessage: `Erreur lors de la récupération de l'item mis à jour: ${fetchError.message}`
        })
      }

      // Formater la réponse
      const formattedItem = {
        id: updatedItem.id,
        listId: updatedItem.list_id,
        name: updatedItem.name,
        amount: updatedItem.amount,
        unit: updatedItem.unit,
        recipeId: updatedItem.recipe_id,
        isChecked: updatedItem.is_checked,
        createdAt: updatedItem.created_at,
        updatedAt: updatedItem.updated_at
      }

      return {
        success: true,
        item: formattedItem,
        message: `Quantité de "${name}" mise à jour à ${totalAmount} ${unit} (consolidation automatique)`,
        consolidated: true
      }
    } else {
      // Aucun item existant, insérer normalement
      const { data, error } = await supabase
        .from('shopping_items')
        .insert({
          list_id: listId,
          name,
          amount,
          unit,
          recipe_id: recipeId
        })
        .select()
        .single()

      if (error) {
        console.error('Erreur Supabase lors de l\'ajout de l\'article:', error)
        throw createError({
          statusCode: 500,
          statusMessage: `Erreur lors de l'ajout de l'article: ${error.message}`
        })
      }

      // Formater la réponse
      const formattedItem = {
        id: data.id,
        listId: data.list_id,
        name: data.name,
        amount: data.amount,
        unit: data.unit,
        recipeId: data.recipe_id,
        isChecked: data.is_checked,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      }

      return {
        success: true,
        item: formattedItem,
        message: `Article "${name}" ajouté à la liste "${list.name}"`,
        consolidated: false
      }
    }

  } catch (error: any) {
    console.error('Erreur lors de l\'ajout de l\'article:', error)
    
    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: `Erreur interne du serveur: ${error.message || 'Erreur inconnue'}`
    })
  }
})
