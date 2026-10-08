// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { useEdition } from '../../app/composables/useEdition'

/**
 * useEdition() dans l'app Nuxt de test : runtimeConfig par défaut (aucune
 * variable NUXT_PUBLIC_EDITION) = édition Boultons.
 */
describe('useEdition', () => {
  it('édition par défaut : Boultons', () => {
    const edition = useEdition()
    expect(useRuntimeConfig().public.edition).toBe('boultons')
    expect(edition.edition).toBe('boultons')
    expect(edition.isBoultons).toBe(true)
    expect(edition.isGeneric).toBe(false)
    expect(edition.siteName.value).toBe('Recettes des Boultons')
    expect(edition.config.categoryImages?.soupes).toBe('/images/categories/soupes.png')
  })

  it('textes de marque dans la langue courante', () => {
    const { tagline, text } = useEdition()
    expect(tagline.value).toBe('Retrouvez ici toutes les recettes préférées des Boultons !')
    expect(text({ fr: 'Bonjour', en: 'Hello' })).toBe('Bonjour')
  })
})
