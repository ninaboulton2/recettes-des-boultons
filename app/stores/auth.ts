import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { JwtPayload } from '@supabase/supabase-js'
import type { Database } from '#shared/types/database'
import type { LoginCredentials, User, UserRole } from '#shared/types'

type ProfileRow = Database['public']['Tables']['profiles']['Row']

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

function toUserRole(value: unknown): UserRole | undefined {
  return value === 'admin' || value === 'user' ? value : undefined
}

/**
 * Rôle porté par le JWT : claim `user_role` ajouté par le hook
 * `custom_access_token_hook` (migration 0009), à la racine des claims
 * (ou dans `app_metadata`). `undefined` si le claim est absent.
 */
export function roleFromClaims(claims: JwtPayload | null | undefined): UserRole | undefined {
  if (!claims) return undefined
  const nested = claims.app_metadata && typeof claims.app_metadata === 'object'
    ? (claims.app_metadata as Record<string, unknown>).user_role
    : undefined
  return toUserRole(claims.user_role) ?? toUserRole(nested)
}

export interface LoginResult {
  success: boolean
  error?: string
}

/**
 * Store d'authentification.
 *
 * La session elle-même (cookie, refresh) est gérée par @nuxtjs/supabase :
 * `useSupabaseUser()` (claims du JWT) est la source de vérité pour l'identité
 * et le rôle (`user_role`). Ce store ne fait qu'y accoler le profil applicatif
 * (`profiles` : nom, préférences), chargé côté client sans bloquer le rendu.
 */
export const useAuthStore = defineStore('auth', () => {
  const supabase = useSupabaseClient<Database>()
  const claims = useSupabaseUser()

  const profile = ref<ProfileRow | null>(null)

  const identity = computed<AuthIdentity | null>(() =>
    claims.value ? identityFromClaims(claims.value) : null
  )

  /** Rôle : le claim JWT fait foi ; repli sur `profiles.role` s'il est absent. */
  const role = computed<UserRole>(() =>
    roleFromClaims(claims.value) ?? toUserRole(profile.value?.role) ?? 'user'
  )

  const isAuthenticated = computed(() => identity.value !== null)
  const isAdmin = computed(() => isAuthenticated.value && role.value === 'admin')

  const currentUser = computed<User | null>(() => {
    if (!identity.value) return null
    const matchingProfile = profile.value?.id === identity.value.id ? profile.value : null
    return {
      id: identity.value.id,
      email: identity.value.email ?? matchingProfile?.email ?? '',
      name: matchingProfile?.name ?? undefined,
      role: role.value,
      language: matchingProfile?.language === 'en' ? 'en' : 'fr',
      theme: matchingProfile?.theme === 'dark' ? 'dark' : 'light',
      notifications: matchingProfile?.notifications ?? true,
      createdAt: matchingProfile?.created_at ?? identity.value.createdAt ?? '',
      updatedAt: matchingProfile?.updated_at ?? undefined
    }
  })

  /** Compatibilité : l'ancien store exposait `user`. */
  const user = currentUser

  async function loadProfile(id: string): Promise<void> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) {
      console.error('Erreur lors de la récupération du profil:', error)
      return
    }
    profile.value = data
  }

  /** Aligne le profil applicatif sur la session Supabase courante (cookie). */
  async function checkAuth(): Promise<void> {
    const id = identity.value?.id
    if (!id) {
      profile.value = null
      return
    }
    if (profile.value?.id !== id) {
      await loadProfile(id)
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

      await loadProfile(data.user.id)
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
      profile.value = null
    }
  }

  async function init(): Promise<void> {
    await checkAuth()
  }

  // Côté client, suit les changements de session (connexion, déconnexion,
  // expiration, rechargement de page) sans écouteur manuel.
  if (import.meta.client) {
    watch(identity, () => { void checkAuth() }, { immediate: true })
  }

  return {
    user,
    profile,
    isAuthenticated,
    isAdmin,
    role,
    currentUser,
    login,
    logout,
    checkAuth,
    init
  }
})
