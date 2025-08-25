import { defineStore } from 'pinia'
import type { User, LoginCredentials, AuthResponse, AuthState } from '~/types'
import { useSupabase } from '~/composables/useSupabase'

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
      try {
        // Connexion via Supabase avec email
        const { supabase } = useSupabase()
        const { data, error } = await supabase.auth.signInWithPassword({
          email: credentials.email,
          password: credentials.password
        })

        if (error) {
          console.error('Erreur de connexion Supabase:', error)
          return { 
            success: false, 
            error: error.message || 'Identifiants invalides' 
          }
        }

        if (data.user) {
          // Récupérer le profil utilisateur
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
            .single()

          if (profileError) {
            console.error('Erreur lors de la récupération du profil:', profileError)
          }

          // Créer l'objet utilisateur simplifié
          this.user = {
            id: data.user.id,
            email: data.user.email || '',
            name: profile?.name,
            role: profile?.role || 'user',
            language: profile?.language || 'fr',
            theme: profile?.theme || 'light',
            notifications: profile?.notifications || true,
            createdAt: data.user.created_at,
            updatedAt: profile?.updated_at
          }

          this.token = data.session?.access_token || null
          this.isAuthenticated = true

          return { success: true }
        } else {
          return { 
            success: false, 
            error: 'Aucun utilisateur retourné' 
          }
        }
      } catch (error) {
        console.error('Erreur de connexion:', error)
        return { 
          success: false, 
          error: error instanceof Error ? error.message : 'Erreur de connexion' 
        }
      }
    },

    async logout() {
      try {
        // Déconnexion via Supabase
        const { supabase } = useSupabase()
        await supabase.auth.signOut()
      } catch (error) {
        console.error('Erreur lors de la déconnexion:', error)
      } finally {
        this.user = null
        this.token = null
        this.isAuthenticated = false
      }
    },

    async checkAuth() {
      try {
        // Vérifier l'authentification via Supabase
        const { supabase } = useSupabase()
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (error) {
          console.error('Erreur lors de la vérification de la session:', error)
          this.logout()
          return
        }

        if (session?.user) {
          // Récupérer le profil utilisateur
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single()

          if (profileError) {
            console.error('Erreur lors de la récupération du profil:', profileError)
          }

          // Créer l'objet utilisateur simplifié
          this.user = {
            id: session.user.id,
            email: session.user.email || '',
            name: profile?.name,
            role: profile?.role || 'user',
            language: profile?.language || 'fr',
            theme: profile?.theme || 'light',
            notifications: profile?.notifications || true,
            createdAt: session.user.created_at,
            updatedAt: profile?.updated_at
          }

          this.token = session.access_token
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
      
      // Écouter les changements d'authentification Supabase
      const { supabase } = useSupabase()
      supabase.auth.onAuthStateChange(async (event, session) => {
        console.log('Changement d\'état d\'authentification:', event)
        
        if (event === 'SIGNED_IN' && session?.user) {
          // Récupérer le profil utilisateur
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single()

          if (profileError) {
            console.error('Erreur lors de la récupération du profil:', profileError)
          }

          // Créer l'objet utilisateur simplifié
          this.user = {
            id: session.user.id,
            email: session.user.email || '',
            name: profile?.name,
            role: profile?.role || 'user',
            language: profile?.language || 'fr',
            theme: profile?.theme || 'light',
            notifications: profile?.notifications || true,
            createdAt: session.user.created_at,
            updatedAt: profile?.updated_at
          }

          this.token = session.access_token
          this.isAuthenticated = true
        } else if (event === 'SIGNED_OUT') {
          this.logout()
        }
      })
    },

    // Méthode pour vérifier la sécurité de la configuration
    checkSecurityConfig() {
      // Vérifier que Supabase est configuré
      if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
        console.error('[SECURITY] Configuration Supabase manquante!')
      }
    }
  }
}) 