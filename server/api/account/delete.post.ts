import { createError, defineEventHandler } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'
import { deleteAccountInputSchema } from '#shared/schemas/social'
import type { Database } from '#shared/types/database'

/**
 * POST /api/account/delete — supprime DÉFINITIVEMENT le compte de la personne connectée (dossier §7.4).
 * Corps : `{ confirmEmail }` = l'adresse e-mail du compte (saisie de confirmation). L'identité vient de la session,
 * jamais du corps. La clé service_role n'est lue que côté serveur (variable `SUPABASE_SECRET_KEY`, voir env.example).
 *  - 400 : l'adresse saisie ne correspond pas ;
 *  - 409 : un groupe créé par la personne a d'autres membres (`data.blockers` : à transférer ou supprimer d'abord) ;
 *  - 200 : `{ success: true }` — l'interface déconnecte alors la personne.
 * Logique : `server/utils/accountDeletion.ts` (testée avec de faux ports).
 */
export default defineEventHandler(async (event) => {
  try {
    const { supabase, user } = await requireUser(event)
    const { confirmEmail } = await validateBody(event, deleteAccountInputSchema)
    if (!user.email || confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) {
      throw createError({ statusCode: 400, statusMessage: 'L\'adresse e-mail saisie ne correspond pas à votre compte' })
    }

    const admin = serverSupabaseServiceRole<Database>(event)
    const result = await deleteAccountFlow({
      blockers: () => supabase.rpc('account_deletion_blockers'),
      photoPaths: () => admin.from('recipes').select('photo_path').eq('owner_id', user.id).not('photo_path', 'is', null),
      prepare: () => admin.rpc('prepare_account_deletion', { p_user: user.id }),
      deleteAuthUser: () => admin.auth.admin.deleteUser(user.id),
      removePhotos: paths => admin.storage.from('recipe-photos').remove(paths)
    })

    return { success: true, message: 'Compte supprimé', ...result }
  } catch (error: unknown) {
    handleApiError(error, 'account-delete')
  }
})
