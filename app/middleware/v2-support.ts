/**
 * Pages du support (v2) : interrupteur éteint, visiteur ou personne sans rôle support/admin = 404 (la page n'existe pas pour elle).
 * Contrôle d'affichage seulement : la lecture et le traitement des signalements sont limités par le RLS (`private.is_support()`).
 */
export default defineNuxtRouteMiddleware(() => {
  const notFound = () => abortNavigation(createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true }))
  if (!useV2()) return notFound()
  const authStore = useAuthStore()
  if (!authStore.isAuthenticated) return navigateTo(useLocalePath()('/'))
  if (!authStore.isAdmin) return notFound()
})
