/**
 * Pages v2 PUBLIQUES (pages légales, « Compte supprimé ») : interrupteur éteint = 404, comme si la page n'existait pas
 * (la v1 reste strictement identique). Aucune exigence de connexion.
 */
export default defineNuxtRouteMiddleware(() => {
  if (!useV2()) {
    return abortNavigation(createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true }))
  }
})
