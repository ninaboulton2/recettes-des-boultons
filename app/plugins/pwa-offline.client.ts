import { watch } from 'vue'
import { startOfflineShopping } from '~/composables/useOfflineShopping'

/** Cache Workbox des pages HTML visitées (`pwa.workbox.runtimeCaching` de nuxt.config.ts). */
const PAGES_CACHE = 'pages'

/**
 * PWA côté client :
 * - courses hors ligne : copie des listes à chaque chargement réussi
 *   (`startOfflineShopping`, après l'hydratation pour ne pas la perturber) ;
 * - déconnexion : purge du cache des pages HTML du service worker (elles
 *   peuvent contenir des données du compte rendues côté serveur).
 *
 * L'enregistrement du service worker lui-même est fait par @vite-pwa/nuxt
 * (`registerType: 'autoUpdate'`).
 */
export default defineNuxtPlugin({
  name: 'pwa-offline',
  setup(nuxtApp) {
    nuxtApp.hook('app:mounted', () => {
      startOfflineShopping()

      const authStore = useAuthStore()
      watch(
        () => authStore.currentUser?.id ?? null,
        (userId, previous) => {
          if (previous && !userId && 'caches' in window) {
            caches.delete(PAGES_CACHE).catch(() => {
              // Cache indisponible : rien à purger.
            })
          }
        }
      )
    })
  }
})
