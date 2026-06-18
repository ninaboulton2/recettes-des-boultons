import { defineEventHandler, readBody, createError } from 'h3'

export default defineEventHandler(async (event) => {
  try {
    const { supabase, user } = await requireUser(event)

    const body = await readBody(event)
    const { dateString, noteType, content } = body
    const userId = user.id

    if (!dateString || !noteType || !['day', 'lunch', 'dinner'].includes(noteType)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Date, type de note et contenu requis. Type doit être "day", "lunch" ou "dinner"'
      })
    }

    // Vérifier si une note existe déjà pour cette date/type/utilisateur
    const { data: existingNote, error: checkError } = await supabase
      .from('planning_notes')
      .select('id, content')
      .eq('date_string', dateString)
      .eq('note_type', noteType)
      .eq('user_id', userId)
      .single()

    let result
    if (existingNote) {
      console.log('✅ Note existante trouvée, mise à jour...')
      // Mettre à jour la note existante
      const { data, error } = await supabase
        .from('planning_notes')
        .update({
          content: content || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingNote.id)
        .select()
        .single()

      if (error) {
        console.error('❌ Erreur Supabase lors de la mise à jour de la note:', error)
        throw createError({
          statusCode: 500,
          statusMessage: `Erreur lors de la mise à jour de la note: ${error.message}`
        })
      }

      result = data
      console.log('✅ Note mise à jour avec succès:', result)
    } else {
      console.log('🆕 Aucune note existante, création...')
      // Créer une nouvelle note
      const { data, error } = await supabase
        .from('planning_notes')
        .insert({
          date_string: dateString,
          note_type: noteType,
          content: content || null,
          user_id: userId
        })
        .select()
        .single()

      if (error) {
        console.error('❌ Erreur Supabase lors de la création de la note:', error)
        throw createError({
          statusCode: 500,
          statusMessage: `Erreur lors de la création de la note: ${error.message}`
        })
      }

      result = data
      console.log('✅ Note créée avec succès:', result)
    }

    // Formater la réponse
    const formattedNote = {
      id: result.id,
      dateString: result.date_string,
      noteType: result.note_type,
      content: result.content,
      userId: result.user_id,
      createdAt: result.created_at,
      updatedAt: result.updated_at
    }

    return {
      success: true,
      note: formattedNote,
      message: existingNote ? 'Note mise à jour avec succès' : 'Note créée avec succès'
    }

  } catch (error: any) {
    console.error('Erreur lors de la gestion de la note:', error)
    
    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: `Erreur interne du serveur: ${error.message || 'Erreur inconnue'}`
    })
  }
})
