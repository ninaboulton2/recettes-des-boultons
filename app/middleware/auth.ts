/**
 * Protège les routes déclarant `definePageMeta({ requiresAdmin: true })`.
 * La validité de la session est gérée par @nuxtjs/supabase (cookie + refresh) ;
 * les endpoints serveur revérifient de toute façon le rôle (requireAdmin).
 */
export default defineNuxtRouteMiddleware((to) => {
  if (!to.meta.requiresAdmin) return

  const authStore = useAuthStore()
  if (!authStore.isAuthenticated || !authStore.isAdmin) {
    return navigateTo('/')
  }
})
