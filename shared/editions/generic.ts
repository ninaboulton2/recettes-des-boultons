import type { EditionConfig } from './types'

/**
 * Édition générique : design modernisé (accent terracotta, neutre `stone`,
 * icônes Lucide, accueil allégé). Base de la future v2 multi-comptes.
 */
export const genericEdition: EditionConfig = {
  id: 'generic',
  brand: {
    name: { fr: 'Carnet de recettes', en: 'Recipe Book' },
    shortName: 'Recettes',
    tagline: {
      fr: 'Toutes vos recettes préférées, au même endroit.',
      en: 'All your favorite recipes, in one place.'
    },
    homeDescription: {
      fr: 'Vos recettes, vos listes de courses et votre planning de repas, au même endroit.',
      en: 'Your recipes, shopping lists and meal planning, in one place.'
    },
    logo: '/images/logo.png',
    nameColor: null,
    // Toque terracotta (scripts/generate-pwa-icons.mjs).
    icons: {
      svg: '/favicon.svg',
      png32: '/favicon-32.png',
      png48: null,
      appleTouch: '/apple-touch-icon.png',
      pwa: {
        any192: '/pwa-192x192.png',
        any512: '/pwa-512x512.png',
        maskable512: '/maskable-icon-512x512.png'
      }
    }
  },
  theme: {
    // Terracotta : 500 ≈ #c2603e.
    primary: {
      50: '#fcf5f0',
      100: '#f8e7dc',
      200: '#f0ccb8',
      300: '#e6a98b',
      400: '#e07f5e',
      500: '#c2603e',
      600: '#a84f31',
      700: '#8c3f28',
      800: '#733524',
      900: '#5e2e20',
      950: '#331610'
    },
    neutral: 'stone',
    // Blanc sur 600 = 5,5:1 ; en sombre, 400 sur stone-900 ≈ 6:1.
    primaryShade: { light: 600, dark: 400 },
    themeColor: { light: '#c2603e', dark: '#1c1917' },
    backgroundColor: '#fafaf9'
  },
  home: {
    variant: 'generic',
    heroImage: null
  },
  categoryImages: null,
  recipeCards: { visual: 'adaptive' }
}
