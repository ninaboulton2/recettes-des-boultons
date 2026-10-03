import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { JwtPayload } from '@supabase/supabase-js'
import type { LoginCredentials, User } from '#shared/types'

// TODO(phase 2): typer avec shared/types/database.ts (Tables<'profiles'>)
interface ProfileRow {
  name?: string | null
  role?: 'admin' | 'user' | null
  language?: 'fr' | 'en' | null
  theme?: 'light' | 'dark' | null
  notifications?: boolean | null
  created_at?: string | null
  updated_at?: string | null
}

/** Identité minimale commune au JWT (cookie) et à l'objet User (login). */
interface AuthIdentity {
  id: string
  email?: string
  createdAt?: string
}

function identityFromClaims(claims: JwtPayload): AuthIdentity | null {
  if (!claims.sub) return null
  return {
    id: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : undefined
  }
}

export interface LoginResult {
  success: boolean
  error?: string
}

/**
 * Store d'authentification.
 *
 * La session elle-même (cookie, refresh) est gérée par @nuxtjs/supabase :
 * `useSupabaseUser()` est la source de vérité, ce store ne fait qu'y accoler
 * le profil applicatif (`profiles` : nom, rôle, préférences).
 */
export const useAuthStore = defineStore('auth', () => {
  const supabase = useSupabaseClient()
  const supabaseUser = useSupabaseUser()

  const user = ref<User | null>(null)

  const isAuthenticated = computed(() => user.value !== null)
  const isAdmin = computed(() => user.value?.role === 'admin')
  const currentUser = computed(() => user.value)

  async function loadProfile(identity: AuthIdentity): Promise<void> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', identity.id)
      .maybeSingle()

    if (error) {
      console.error('Erreur lors de la récupération du profil:', error)
    }

    const profile = (data ?? null) as ProfileRow | null

    user.value = {
      id: identity.id,
      email: identity.email ?? '',
      name: profile?.name ?? undefined,
      role: profile?.role ?? 'user',
      language: profile?.language ?? 'fr',
      theme: profile?.theme ?? 'light',
      notifications: profile?.notifications ?? true,
      createdAt: profile?.created_at ?? identity.createdAt ?? '',
      updatedAt: profile?.updated_at ?? undefined
    }
  }

  /** Aligne le store sur la session Supabase courante (cookie). */
  async function checkAuth(): Promise<void> {
    const identity = supabaseUser.value ? identityFromClaims(supabaseUser.value) : null
    if (!identity) {
      user.value = null
      return
    }
    if (user.value?.id !== identity.id) {
      await loadProfile(identity)
    }
  }

  async function login(credentials: LoginCredentials): Promise<LoginResult> {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: credentials.email,
        password: credentials.password
      })

      if (error) {
        return { success: false, error: error.message || 'Identifiants invalides' }
      }
      if (!data.user) {
        return { success: false, error: 'Aucun utilisateur retourné' }
      }

      await loadProfile({ id: data.user.id, email: data.user.email, createdAt: data.user.created_at })
      return { success: true }
    } catch (error) {
      console.error('Erreur de connexion:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur de connexion'
      }
    }
  }

  async function logout(): Promise<void> {
    try {
      await supabase.auth.signOut()
    } catch (error) {
      console.error('Erreur lors de la déconnexion:', error)
    } finally {
      user.value = null
    }
  }

  async function init(): Promise<void> {
    await checkAuth()
  }

  // Côté client, suit les changements de session (connexion, déconnexion,
  // expiration, rechargement de page) sans écouteur manuel.
  if (import.meta.client) {
    watch(supabaseUser, () => { void checkAuth() }, { immediate: true })
  }

  return {
    user,
    isAuthenticated,
    isAdmin,
    currentUser,
    login,
    logout,
    checkAuth,
    init
  }
})
