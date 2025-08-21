import { isProtectedRoute, isPublicApiRoute } from '~/config/auth.config'
import { getSecurityConfig } from '~/config/env'

// Middleware côté client pour les en-têtes de sécurité
export default defineNuxtRouteMiddleware((to) => {
  // Ajouter des en-têtes de sécurité sur toutes les pages
  if (process.client) {
    // En-têtes de sécurité côté client (si possible)
    if (typeof window !== 'undefined') {
      // Désactiver l'affichage des informations sensibles dans la console
      console.log = (function(old_function) {
        return function() {
          if (process.env.NODE_ENV === 'production') {
            // En production, limiter les logs sensibles
            const args = Array.prototype.slice.call(arguments)
            const filteredArgs = args.map(arg => {
              if (typeof arg === 'string' && (
                arg.includes('password') || 
                arg.includes('token') || 
                arg.includes('secret') ||
                arg.includes('admin')
              )) {
                return '[REDACTED]'
              }
              return arg
            })
            old_function.apply(this, filteredArgs)
          } else {
            old_function.apply(this, arguments)
          }
        }
      })(console.log)
    }
  }
})
