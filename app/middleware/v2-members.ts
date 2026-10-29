import { loginRedirectUrl } from '#shared/utils/returnPath'

/**
 * Pages de la barre de navigation visibles aussi du visiteur en v2 (Favoris, Planning, Courses) :
 * sans compte, retour à l'accueil avec la fenêtre de connexion ouverte, puis retour sur la page demandée.
 * Sans effet en v1 (ces pages y restent comme avant). Affichage seulement : les droits sont en base.
 */
export default defineNuxtRouteMiddleware((to) => {
  if (!useV2() || useAuthStore().isAuthenticated) return
  return navigateTo(loginRedirectUrl(useLocalePath()('/'), to.fullPath))
})
