// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  typescript: {
    // TypeScript strict sur tous les tsconfig générés (.nuxt/tsconfig.*.json),
    // référencés par le tsconfig.json racine.
    strict: true
  },
  devServer: {
    port: 3001
  },
  modules: [
    '@nuxt/ui',
    '@pinia/nuxt',
    '@nuxt/image',
    '@nuxtjs/i18n',
    '@nuxtjs/supabase',
    '@nuxt/eslint'
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
  supabase: {
    // Le module lit SUPABASE_URL / SUPABASE_KEY ; notre .env et Vercel
    // utilisent SUPABASE_ANON_KEY : on mappe explicitement (voir DEVELOPER.md).
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_ANON_KEY,
    // Pas de redirection automatique vers /login : l'app gère ses modales.
    redirect: false,
    // Types générés depuis la base (npx supabase gen types typescript --local) :
    // useSupabaseClient() / serverSupabaseClient() deviennent typés.
    types: '~~/shared/types/database.ts'
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