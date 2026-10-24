/**
 * Accueil des nouveaux comptes (v2) : une personne connectée dont `profiles.onboarded_at` est vide est envoyée sur
 * `/onboarding` (3 écrans) avant tout autre écran ; une fois l'accueil terminé, cette page renvoie à l'accueil.
 * Sans effet quand l'interrupteur v2 est éteint. Le profil est lu une seule fois (store `auth`).
 */
export default defineNuxtRouteMiddleware(async (to) => {
  if (!useV2()) return
  // Retours d'authentification (lien e-mail) : la page traite le jeton avant toute redirection.
  if (/^\/(?:en\/)?(?:confirm|reset-password)(?:\/|$)/.test(to.path)) return
  const authStore = useAuthStore()
  if (!authStore.isAuthenticated) return

  await authStore.checkAuth()
  const profile = authStore.profile
  // Pas de profil lisible (erreur réseau, compte sans ligne) : ne pas enfermer la personne.
  if (!profile) return

  const localePath = useLocalePath()
  const onboardingPath = localePath('/onboarding')
  const onOnboarding = to.path === onboardingPath || to.path.replace(/\/$/, '') === onboardingPath
  const needsOnboarding = !profile.onboarded_at

  if (needsOnboarding && !onOnboarding) return navigateTo(onboardingPath)
  if (!needsOnboarding && onOnboarding) return navigateTo(localePath('/'))
})
