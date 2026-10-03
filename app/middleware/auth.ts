// Middleware d'authentification simplifié

export default defineNuxtRouteMiddleware((to) => {
  // Si la route nécessite une authentification admin
  if (to.meta.requiresAdmin) {
    const authStore = useAuthStore()
    
    // Vérifier si l'utilisateur est connecté et est admin
    if (!authStore.isAuthenticated || !authStore.isAdmin) {
      // Logger la tentative d'accès non autorisé
      console.warn(`[SECURITY] Tentative d'accès non autorisé à ${to.path}`)
      
      // Rediriger vers la page d'accueil si non autorisé
      return navigateTo('/')
    }
    
    // Vérifier la validité du token
    if (authStore.token) {
      try {
        // Vérifier que le token n'est pas expiré
        const tokenData = JSON.parse(atob(authStore.token.split('.')[1]))
        if (tokenData.exp && Date.now() >= tokenData.exp * 1000) {
          console.warn('[SECURITY] Token expiré détecté')
          authStore.logout()
          return navigateTo('/')
        }
      } catch (error) {
        console.error('[SECURITY] Erreur lors de la vérification du token:', error)
        authStore.logout()
        return navigateTo('/')
      }
    }
  }
}) 