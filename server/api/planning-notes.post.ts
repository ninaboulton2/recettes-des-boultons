import { defineEventHandler } from 'h3'
import { planningNoteInputSchema, textOrNull } from '#shared/schemas'

/**
 * POST /api/planning-notes — crée ou met à jour la note d'une date/type
 * (`day`, `lunch`, `dinner`) pour l'utilisateur connecté.
 * Body : `{ dateString: 'AAAA-MM-JJ', noteType, content? }`.
 */

interface PlanningNoteRow {
  id: string
  user_id: string | null
  date_string: string
  note_type: string
  content: string | null
  created_at: string | null
  updated_at: string | null
}

function mapNote(row: PlanningNoteRow) {
  return {
    id: row.id,
    dateString: row.date_string,
    noteType: row.note_type,
    content: row.content,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export default defineEventHandler(async (event) => {
  try {
    const { supabase, user } = await requireUser(event)
    const input = await validateBody(event, planningNoteInputSchema)
    const content = textOrNull(input.content)

    // Pas de contrainte d'unicité en base : on cherche la note existante (la plus ancienne).
    const { data: existingRows, error: findError } = await supabase
      .from('planning_notes')
      .select('id')
      .eq('date_string', input.dateString)
      .eq('note_type', input.noteType)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
    if (findError) throwSupabaseError(findError, 'planning-notes.post find')

    const existing = (existingRows as Array<{ id: string }> | null)?.[0]

    const query = existing
      ? supabase
          .from('planning_notes')
          .update({ content, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
      : supabase
          .from('planning_notes')
          .insert({ date_string: input.dateString, note_type: input.noteType, content, user_id: user.id })

    const { data, error } = await query.select('*').single()
    if (error) throwSupabaseError(error, 'planning-notes.post save')

    return {
      success: true,
      note: mapNote(data as PlanningNoteRow),
      message: existing ? 'Note mise à jour' : 'Note créée'
    }
  } catch (error: unknown) {
    handleApiError(error, 'planning-notes.post')
  }
})
