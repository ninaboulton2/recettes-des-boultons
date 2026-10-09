import type { EditionConfig } from './types'

/**
 * Édition « Recettes des Boultons » (défaut) : identité d'origine du site
 * (palette bleu-vert, neutre `slate`, illustrations de catégories, accueil
 * au héros diagonal, logo couleur lavande).
 */
export const boultonsEdition: EditionConfig = {
  id: 'boultons',
  brand: {
    name: { fr: 'Recettes des Boultons', en: 'Recettes des Boultons' },
    shortName: 'Boultons',
    tagline: {
      fr: 'Retrouvez ici toutes les recettes préférées des Boultons !',
      en: 'Find here all the favorite recipes of the Boultons!'
    },
    homeDescription: {
      fr: 'Découvrez les recettes préférées de la famille Boultons. Soupes, plats, desserts et plus encore !',
      en: 'Discover the Boultons family\'s favorite recipes. Soups, mains, desserts and more!'
    },
    logo: '/images/logo.png',
    // Couleur d'origine du nom (rgb(123, 136, 189)) : 5,2:1 sur le fond
    // sombre slate-900, gardée telle quelle dans les deux modes.
    nameColor: { light: '#7b88bd', dark: '#7b88bd' },
    // Cocotte d'origine (générée depuis /images/logo.png).
    icons: {
      svg: null,
      png32: '/editions/boultons/favicon-32.png',
      png48: '/editions/boultons/favicon-48.png',
      appleTouch: '/editions/boultons/apple-touch-icon.png'
    }
  },
  theme: {
    // Palette bleu-vert d'origine (ancien tailwind.config.js).
    primary: {
      50: '#f0f8f9',
      100: '#e0f1f3',
      200: '#c1e3e7',
      300: '#a2d5db',
      400: '#83c7cf',
      500: '#64b9c3',
      600: '#4da8b3',
      700: '#3d8a94',
      800: '#2e6c75',
      900: '#1f4e56',
      950: '#163a40'
    },
    neutral: 'slate',
    // Blanc sur 600 = 2,8:1 et sur 700 = 4,0:1 (insuffisant pour du texte) :
    // 800 en clair (6,0:1). En sombre, 400 sur slate-900 = 9,4:1.
    primaryShade: { light: 800, dark: 400 },
    themeColor: { light: '#3d8a94', dark: '#0f172a' },
    backgroundColor: '#f8fafc'
  },
  home: {
    variant: 'boultons',
    heroImage: {
      src: '/images/boultons.png',
      alt: { fr: 'La famille Boultons', en: 'The Boultons family' }
    }
  },
  categoryImages: {
    'soupes': '/images/categories/soupes.png',
    'entrees': '/images/categories/entrees.png',
    'plats': '/images/categories/plats.png',
    'poissons': '/images/categories/poissons.png',
    'viandes': '/images/categories/viandes.png',
    'yaourts et fromages': '/images/categories/yaourts-fromages.png',
    'desserts et gâteaux': '/images/categories/desserts.png',
    'boissons': '/images/categories/boissons.png',
    'confitures': '/images/categories/confitures.png'
  },
  recipeCards: { visual: 'fixed' }
}
