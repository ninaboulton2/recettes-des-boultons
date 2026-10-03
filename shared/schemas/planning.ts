import { z } from 'zod'
import { dateStringSchema, optionalText, requiredText, uuidSchema } from './common'

/** Schémas d'écriture du planning et de ses notes. */

export const MEAL_TYPES = ['lunch', 'dinner'] as const
export const NOTE_TYPES = ['day', 'lunch', 'dinner'] as const

export const mealTypeSchema = z.enum(MEAL_TYPES, {
  errorMap: () => ({ message: 'doit être lunch ou dinner' })
})
export const noteTypeSchema = z.enum(NOTE_TYPES, {
  errorMap: () => ({ message: 'doit être day, lunch ou dinner' })
})

/** `POST /api/planning` — une recette OU un titre personnalisé. */
export const planningEntryInputSchema = z.object({
  dateString: dateStringSchema,
  mealType: mealTypeSchema,
  recipeId: uuidSchema.nullish(),
  customTitle: requiredText(200).nullish()
}).refine(
  value => Boolean(value.recipeId) || Boolean(value.customTitle),
  { message: 'une recette ou un titre personnalisé est requis', path: ['recipeId'] }
)

/** `POST /api/planning-notes` — création ou mise à jour (date + type uniques par utilisateur). */
export const planningNoteInputSchema = z.object({
  dateString: dateStringSchema,
  noteType: noteTypeSchema,
  content: optionalText(5000)
})

/** `DELETE /api/planning-notes?dateString=&noteType=` */
export const planningNoteQuerySchema = z.object({
  dateString: dateStringSchema,
  noteType: noteTypeSchema
})

export const planningIdParamsSchema = z.object({ id: uuidSchema })

export type MealType = z.infer<typeof mealTypeSchema>
export type NoteType = z.infer<typeof noteTypeSchema>
export type PlanningEntryInput = z.infer<typeof planningEntryInputSchema>
export type PlanningNoteInput = z.infer<typeof planningNoteInputSchema>
