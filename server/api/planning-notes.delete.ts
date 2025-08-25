import { defineEventHandler, getQuery, createError } from 'h3'
import { supabase } from '~/utils/supabase'

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const dateString = String(query.dateString || '')
    const noteType = String(query.noteType || '')
    const userId = String(query.userId || '')

    if (!dateString || !noteType || !userId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Date, type de note et userId requis'
      })
    }

    if (!['day', 'lunch', 'dinner'].includes(noteType)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Type de note doit être "day", "lunch" ou "dinner"'
      })
    }

    console.log('🗑️ Debug API - Suppression note:', {
      dateString,
      noteType,
      userId
    })

    // Vérifier que la note existe et appartient à l'utilisateur
    const { data: existingNote, error: checkError } = await supabase
      .from('planning_notes')
      .select('id, content')
      .eq('date_string', dateString)
      .eq('note_type', noteType)
      .eq('user_id', userId)
      .single()

    if (checkError || !existingNote) {
      console.log('⚠️ Note non trouvée ou erreur de vérification:', checkError)
      // Si la note n'existe pas, considérer que la suppression est réussie
      return {
        success: true,
        message: 'Note supprimée avec succès (n\'existait pas)'
      }
    }

    // Supprimer la note
    const { error: deleteError } = await supabase
      .from('planning_notes')
      .delete()
      .eq('id', existingNote.id)

    if (deleteError) {
      console.error('❌ Erreur Supabase lors de la suppression:', deleteError)
      throw createError({
        statusCode: 500,
        statusMessage: `Erreur lors de la suppression de la note: ${deleteError.message}`
      })
    }

    console.log('✅ Note supprimée avec succès:', existingNote.id)

    return {
      success: true,
      message: 'Note supprimée avec succès'
    }

  } catch (error: any) {
    console.error('Erreur lors de la suppression de la note:', error)
    
    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: `Erreur interne du serveur: ${error.message || 'Erreur inconnue'}`
    })
  }
})
