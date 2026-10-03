// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  devServer: {
    port: 3001
  },
  modules: [
    '@nuxt/ui',
    '@pinia/nuxt',
    '@nuxt/image',
    '@nuxtjs/i18n'
  ],
  css: [
    '~/assets/css/main.css'
  ],
  i18n: {
    locales: [
      {
        code: 'fr',
        language: 'fr-FR',
        name: 'Français',
        file: 'fr.json'
      },
      {
        code: 'en',
        language: 'en-US',
        name: 'English',
        file: 'en.json'
      }
    ],
    defaultLocale: 'fr',
    strategy: 'prefix_except_default',
    langDir: 'locales/',
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'i18n_redirected',
      redirectOn: 'root'
    }
  },
  app: {
    head: {
      title: 'Recettes des Boultons',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Retrouvez ici toutes les recettes préférées des Boultons !' }
      ],
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/images/logo.png' },
        { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/images/logo.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/images/logo.png' }
      ]
    }
  },
  ui: {
    // Pas de mode sombre pour l'instant : l'app n'a aucune variante dark:.
    colorMode: false
  },
  fonts: {
    // Remplace l'ancien <link> Google Fonts : polices servies/optimisées par @nuxt/fonts
    families: [
      { name: 'Lobster', provider: 'google', weights: [400] },
      { name: 'Poppins', provider: 'google', weights: [400, 600, 700] }
    ]
  },
  image: {
    quality: 80,
    format: ['webp', 'jpg', 'png']
  },
  runtimeConfig: {
    public: {
      apiBase: process.env.API_BASE || 'http://localhost:3001',
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY
    }
  },
  nitro: {
    // Déploiement Vercel (anciennement dans nitro.config.ts, non supporté par Nuxt 4)
    preset: 'vercel',
    vercel: {
      functions: {
        'server/api/**/*.ts': {
          maxDuration: 30
        }
      }
    }
  }
}) 