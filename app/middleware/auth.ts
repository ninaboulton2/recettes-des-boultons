/**
 * Protège les routes déclarant `definePageMeta({ requiresAdmin: true })` (v2 : tout compte connecté).
 *
 * Aucune requête réseau : la session vient du cookie (@nuxtjs/supabase) et le
 * rôle du claim `user_role` du JWT (store `auth`). Cette garde ne sert qu'à
 * l'affichage : les endpoints serveur revérifient le rôle (`requireAdmin`) et
 * le RLS s'applique en base.
 */
export default defineNuxtRouteMiddleware((to) => {
  if (!to.meta.requiresAdmin) return

  const authStore = useAuthStore()
  // v2 : l'éditeur et le traducteur sont ouverts à tout compte connecté (le RLS décide pour chaque recette) ; v1 : admins.
  const allowed = authStore.isAuthenticated && (useV2() || authStore.isAdmin)
  if (!allowed) {
    return navigateTo(useLocalePath()('/'))
  }
})
