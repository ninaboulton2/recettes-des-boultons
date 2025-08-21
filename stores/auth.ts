import { defineStore } from 'pinia'
import type { User, LoginCredentials, AuthResponse, AuthState } from '~/types'
import { getAuthConfig, getCookieConfig, isSecureConfig } from '~/config/env'
import { useSecurityStore } from './security'

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    user: null,
    token: null,
    isAuthenticated: false
  }),

  getters: {
    isAdmin: (state) => state.user?.role === 'admin',
    currentUser: (state) => state.user
  },

  actions: {
    async login(credentials: LoginCredentials) {
      const securityStore = useSecurityStore()
      
      // Vérifier si la connexion est autorisée
      const canProceed = securityStore.canProceedWithLogin()
      if (!canProceed.allowed) {
        return { 
          success: false, 
          error: canProceed.reason || 'Connexion temporairement bloquée' 
        }
      }

      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(credentials),
          credentials: 'include' // Important pour les cookies
        })

        if (!response.ok) {
          // Enregistrer la tentative échouée
          securityStore.recordLoginAttempt(false)
          
          if (response.status === 401) {
            throw new Error('Identifiants invalides')
          } else if (response.status === 429) {
            throw new Error('Trop de tentatives. Réessayez plus tard.')
          } else {
            throw new Error('Erreur de connexion')
          }
        }

        const data: AuthResponse = await response.json()

        // Enregistrer la tentative réussie
        securityStore.recordLoginAttempt(true)

        this.user = data.user
        this.token = data.token
        this.isAuthenticated = true

        // Stocker le token dans un cookie sécurisé (géré côté serveur)
        this.setSecureCookie('auth_token', data.token)

        return { success: true }
      } catch (error) {
        console.error('Erreur de connexion:', error)
        return { 
          success: false, 
          error: error instanceof Error ? error.message : 'Identifiants invalides' 
        }
      }
    },

    async logout() {
      this.user = null
      this.token = null
      this.isAuthenticated = false

      // Supprimer le cookie sécurisé
      this.removeSecureCookie('auth_token')
      
      // Réinitialiser l'état de sécurité
      const securityStore = useSecurityStore()
      securityStore.resetSecurityState()
    },

    async checkAuth() {
      try {
        // Vérifier l'authentification via l'API
        const response = await fetch('/api/auth/me', {
          credentials: 'include' // Important pour les cookies
        })
        
        if (response.ok) {
          const data = await response.json()
          this.user = data.user
          this.token = data.token
          this.isAuthenticated = true
        } else {
          this.logout()
        }
      } catch (error) {
        console.error('Erreur de vérification d\'authentification:', error)
        this.logout()
      }
    },

    async init() {
      await this.checkAuth()
    },

    // Méthodes pour gérer les cookies sécurisés
    setSecureCookie(name: string, value: string) {
      if (typeof window === 'undefined') return
      
      const config = getCookieConfig()
      const cookieOptions = [
        `Max-Age=${config.maxAge / 1000}`,
        `Path=/`,
        config.secure ? 'Secure' : '',
        config.httpOnly ? 'HttpOnly' : '',
        `SameSite=${config.sameSite}`
      ].filter(Boolean).join('; ')
      
      // Note: HttpOnly ne peut être défini que côté serveur
      // Cette méthode est pour la compatibilité, mais le serveur doit gérer HttpOnly
      document.cookie = `${name}=${value}; ${cookieOptions}`
    },

    removeSecureCookie(name: string) {
      if (typeof window === 'undefined') return
      
      document.cookie = `${name}=; Max-Age=0; Path=/`
    },

    // Méthode pour vérifier la sécurité de la configuration
    checkSecurityConfig() {
      if (!isSecureConfig()) {
        console.warn('[SECURITY] Configuration non sécurisée détectée!')
        if (process.env.NODE_ENV === 'production') {
          console.error('[SECURITY] Configuration non sécurisée en production!')
        }
      }
    }
  }
}) 