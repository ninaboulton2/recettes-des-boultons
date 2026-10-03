/**
 * Protège les routes déclarant `definePageMeta({ requiresAdmin: true })`.
 *
 * Aucune requête réseau : la session vient du cookie (@nuxtjs/supabase) et le
 * rôle du claim `user_role` du JWT (store `auth`). Cette garde ne sert qu'à
 * l'affichage : les endpoints serveur revérifient le rôle (`requireAdmin`) et
 * le RLS s'applique en base.
 */
export default defineNuxtRouteMiddleware((to) => {
  if (!to.meta.requiresAdmin) return

  const authStore = useAuthStore()
  if (!authStore.isAuthenticated || !authStore.isAdmin) {
    return navigateTo(useLocalePath()('/'))
  }
})
