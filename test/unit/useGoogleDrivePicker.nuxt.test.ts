// @vitest-environment nuxt
import { beforeEach, describe, expect, it } from 'vitest'
import { useGoogleDrivePicker } from '../../app/composables/useGoogleDrivePicker'

/**
 * Enveloppe Vue du composable : `enabled` suit la config publique (bouton
 * masqué sans les trois variables), `pick()` ne lève jamais.
 */
function setGoogleConfig(values: { clientId: string, apiKey: string, appId: string }): void {
  Object.assign(useRuntimeConfig().public.google as object, values)
}

describe('useGoogleDrivePicker', () => {
  beforeEach(() => {
    setGoogleConfig({ clientId: '', apiKey: '', appId: '' })
  })

  it('désactivé par défaut (config locale vide) : le bouton est masqué', () => {
    expect(useRuntimeConfig().public.google).toEqual({ clientId: '', apiKey: '', appId: '' })
    expect(useGoogleDrivePicker().enabled.value).toBe(false)
  })

  it('désactivé tant qu\'une des trois variables manque', () => {
    setGoogleConfig({ clientId: 'id', apiKey: 'key', appId: '' })
    expect(useGoogleDrivePicker().enabled.value).toBe(false)
  })

  it('activé avec les trois variables', () => {
    setGoogleConfig({ clientId: 'id', apiKey: 'key', appId: '123' })
    expect(useGoogleDrivePicker().enabled.value).toBe(true)
  })

  it('pick() désactivé : renvoie null sans rien charger ni signaler', async () => {
    const picker = useGoogleDrivePicker()
    expect(await picker.pick()).toBeNull()
    expect(picker.loading.value).toBe(false)
    expect(picker.error.value).toBeNull()
  })
})
