/**
 * Pages réservées à la v2 (`definePageMeta({ middleware: 'v2-only' })`) :
 *  - interrupteur éteint (`NUXT_PUBLIC_V2` absent) : 404, comme si la page n'existait pas (la v1 n'a pas changé) ;
 *  - visiteur sans compte : retour à l'accueil.
 * Contrôle d'affichage seulement : les droits sont décidés en base (RLS, RPC).
 */
export default defineNuxtRouteMiddleware(() => {
  if (!useV2()) {
    return abortNavigation(createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true }))
  }
  if (!useAuthStore().isAuthenticated) {
    return navigateTo(useLocalePath()('/'))
  }
})
