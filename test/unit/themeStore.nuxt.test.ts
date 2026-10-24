// @vitest-environment nuxt
import { beforeEach, describe, expect, it } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { createPinia, setActivePinia } from 'pinia'
import { boultonsEdition } from '../../shared/editions/boultons'
import { genericEdition } from '../../shared/editions/generic'
import { useEdition } from '../../app/composables/useEdition'
import { useV2 } from '../../app/composables/useV2'
import { useAuthStore } from '../../app/stores/auth'
import { useThemeStore } from '../../app/stores/theme'

/**
 * Thème actif en v2 : thème personnel ou thème d'un groupe (`active_theme_group_id`), aperçu, repli sûr.
 * Et sans l'interrupteur, `useEdition()` reste celui de la v1 (édition figée du runtimeConfig).
 */
mockNuxtImport('useSupabaseClient', () => () => ({
  rpc: async () => ({ data: [], error: null }),
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) })
}))

const GROUP = '22222222-2222-4222-8222-222222222222'

function signIn(profile: Record<string, unknown>) {
  const user = useSupabaseUser()
  user.value = { sub: 'u1', email: 'u1@exemple.fr' } as never
  const auth = useAuthStore()
  auth.profile = { id: 'u1', theme_settings: null, active_theme_group_id: null, ...profile } as never
  return auth
}

describe('interrupteur et édition', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useRuntimeConfig().public.v2 = false
  })

  it('éteint par défaut : useEdition suit NUXT_PUBLIC_EDITION, même connecté avec un thème', () => {
    expect(useV2()).toBe(false)
    signIn({ theme_settings: { preset: 'ocean' } })
    const edition = useEdition()
    expect(edition.config).toBe(boultonsEdition)
    expect(edition.edition).toBe('boultons')
  })

  it('allumé : "true" en chaîne (variable d\'environnement) suffit', () => {
    useRuntimeConfig().public.v2 = 'true' as never
    expect(useV2()).toBe(true)
  })
})

describe('thème actif (v2)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useRuntimeConfig().public.v2 = true
    useSupabaseUser().value = null
    const store = useThemeStore()
    store.setPreview(null)
    store.groupThemes = {}
  })

  it('visiteur : thème générique par défaut', () => {
    expect(useThemeStore().resolved.edition).toBe(genericEdition)
    expect(useEdition().config).toBe(genericEdition)
  })

  it('thème personnel validé', () => {
    signIn({ theme_settings: { preset: 'ocean' } })
    const store = useThemeStore()
    expect(store.resolved.preset).toBe('ocean')
    expect(store.resolved.edition.theme.primary[500]).toBe('#2f74b5')
    expect(useEdition().isGeneric).toBe(true)
  })

  it('thème d\'un groupe (Boultons) : exactement le look d\'origine', () => {
    signIn({ active_theme_group_id: GROUP, theme_settings: { preset: 'ocean' } })
    const store = useThemeStore()
    store.groupThemes = { [GROUP]: { preset: 'boultons', primary: '#64b9c3', neutral: 'slate', name: 'Recettes des Boultons', home: 'boultons' } }
    expect(store.resolved.edition).toBe(boultonsEdition)
    const edition = useEdition()
    expect(edition.isBoultons).toBe(true)
    expect(edition.siteName.value).toBe('Recettes des Boultons')
  })

  it('thème de groupe hostile ou pas encore chargé : thème par défaut, rien d\'autre', () => {
    signIn({ active_theme_group_id: GROUP })
    const store = useThemeStore()
    expect(store.resolved.edition).toBe(genericEdition)
    store.groupThemes = { [GROUP]: { preset: 'custom', primary: 'red;}body{display:none', name: '<script>' } }
    expect(store.resolved.edition).toBe(genericEdition)
  })

  it('l\'aperçu passe avant le thème enregistré, puis disparaît', () => {
    signIn({ theme_settings: { preset: 'ocean' } })
    const store = useThemeStore()
    store.setPreview({ preset: 'custom', primary: '#aa4466' })
    expect(store.resolved.edition.theme.primary[500]).toBe('#aa4466')
    store.setPreview(null)
    expect(store.resolved.preset).toBe('ocean')
  })
})
