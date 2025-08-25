// Cet endpoint est maintenant obsolète car nous utilisons Supabase Auth
// Il est conservé pour la compatibilité mais n'est plus utilisé

export default defineEventHandler(async (event) => {
  // Rediriger vers Supabase Auth
  throw createError({
    statusCode: 400,
    statusMessage: 'Cet endpoint est obsolète. Utilisez Supabase Auth directement depuis le client.'
  })
}) 