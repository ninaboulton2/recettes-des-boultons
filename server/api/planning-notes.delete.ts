import { defineEventHandler } from 'h3'
import { planningNoteQuerySchema } from '#shared/schemas'

/**
 * DELETE /api/planning-notes?dateString=&noteType= — supprime la note
 * (toutes les lignes de cette date/type pour l'utilisateur). Idempotent :
 * une note absente renvoie aussi `success`.
 */
export default defineEventHandler(async (event) => {
  try {
    const { supabase, user } = await requireUser(event)
    const { dateString, noteType } = validateQuery(event, planningNoteQuerySchema)

    const { data, error } = await supabase
      .from('planning_notes')
      .delete()
      .eq('date_string', dateString)
      .eq('note_type', noteType)
      .eq('user_id', user.id)
      .select('id')

    if (error) {
      throwSupabaseError(error, 'planning-notes.delete')
    }

    const deleted = data?.length ?? 0
    return {
      success: true,
      deleted,
      message: deleted > 0 ? 'Note supprimée' : 'Aucune note à supprimer'
    }
  } catch (error: unknown) {
    handleApiError(error, 'planning-notes.delete')
  }
})
