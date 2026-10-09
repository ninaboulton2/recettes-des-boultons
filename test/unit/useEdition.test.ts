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

  // La langue initiale dépend de l'environnement (navigateur simulé, CI), et
  // `$i18n` n'est pas toujours injecté dans l'app de test : on fixe la langue
  // quand c'est possible ; sans i18n, useEdition retombe sur le français.
  it('textes de marque dans la langue courante', async () => {
    const i18n = useNuxtApp().$i18n as { setLocale: (code: string) => Promise<void> } | undefined
    const { tagline, text } = useEdition()

    await i18n?.setLocale('fr')
    expect(tagline.value).toBe('Retrouvez ici toutes les recettes préférées des Boultons !')
    expect(text({ fr: 'Bonjour', en: 'Hello' })).toBe('Bonjour')

    if (i18n) {
      await i18n.setLocale('en')
      expect(tagline.value).toBe('Find here all the favorite recipes of the Boultons!')
      expect(text({ fr: 'Bonjour', en: 'Hello' })).toBe('Hello')
      await i18n.setLocale('fr')
    }
  })
})
