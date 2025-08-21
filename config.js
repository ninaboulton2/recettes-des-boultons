// Configuration simple de l'application
export default {
  // Configuration de l'application
  app: {
    name: 'Recettes des Boultons',
    version: '1.0.0',
    port: process.env.PORT || 3001
  },

  // Configuration de l'API
  api: {
    baseUrl: process.env.API_BASE || 'http://localhost:3001',
    timeout: 10000
  },

  // Configuration de l'authentification
  auth: {
    tokenKey: 'boultons_auth_token',
    refreshTokenKey: 'boultons_refresh_token'
  },

  // Configuration des recettes
  recipes: {
    categories: [
      'soupes',
      'entrees', 
      'plats',
      'poissons',
      'viandes',
      'yaourts et fromages',
      'desserts et gâteaux',
      'boissons',
      'confitures'
    ],
    defaultImage: '/images/default-recipe.png'
  },

  // Configuration de l'interface
  ui: {
    theme: 'light',
    language: 'fr',
    supportedLanguages: ['fr', 'en']
  }
}
