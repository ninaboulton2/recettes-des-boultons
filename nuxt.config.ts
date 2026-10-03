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
    '@nuxt/eslint',
    // En dernier (recommandation Sentry) : instrumente l'app déjà configurée.
    '@sentry/nuxt/module'
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
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'description', content: 'Retrouvez ici toutes les recettes préférées des Boultons !' },
        // Couleur de la barre du navigateur : accent terracotta (clair) / fond stone (sombre)
        { name: 'theme-color', media: '(prefers-color-scheme: light)', content: '#c2603e' },
        { name: 'theme-color', media: '(prefers-color-scheme: dark)', content: '#1c1917' }
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' }
      ]
    }
  },
  ui: {
    // Vrai mode sombre (classe `.dark`, bouton <UColorModeButton> dans le header).
    colorMode: true
  },
  colorMode: {
    preference: 'system',
    fallback: 'light'
  },
  fonts: {
    // Polices servies/optimisées par @nuxt/fonts : Inter (interface),
    // Fraunces (titres), Lobster (logo uniquement).
    families: [
      { name: 'Inter', provider: 'google', weights: [400, 500, 600, 700] },
      { name: 'Fraunces', provider: 'google', weights: [400, 500, 600, 700] },
      { name: 'Lobster', provider: 'google', weights: [400] }
    ]
  },
  image: {
    quality: 80,
    format: ['webp', 'jpg', 'png']
  },
  runtimeConfig: {
    // --- IA (traducteur de recettes, server/utils/ai/provider.ts) ---
    // Clés privées (serveur). Surchargeables à l'exécution par NUXT_AI_PROVIDER,
    // NUXT_OPENAI_API_KEY… ; les noms historiques (OPENAI_API_KEY, AI_PROVIDER…)
    // sont aussi lus à l'exécution par getAiConfig() (repli process.env).
    aiProvider: process.env.AI_PROVIDER || 'openai',
    aiModel: process.env.AI_MODEL || '',
    aiDailyQuota: process.env.AI_DAILY_QUOTA || '50',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    googleApiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || '',
    mistralApiKey: process.env.MISTRAL_API_KEY || '',
    public: {
      // Fournisseurs OAuth affichés dans la modale d'authentification
      // (liste séparée par des virgules ; NUXT_PUBLIC_AUTH_PROVIDERS=google,apple).
      authProviders: 'google',
      // --- Sentry (sentry.client.config.ts) ---
      // DSN vide = SDK inactif. Surchargeable à l'exécution par
      // NUXT_PUBLIC_SENTRY_DSN ; SENTRY_DSN est lu au build en repli.
      sentry: {
        dsn: process.env.NUXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN || '',
        // Vercel fournit VERCEL_ENV (production | preview | development) au build.
        environment: process.env.VERCEL_ENV || 'development'
      }
    }
  },
  // --- Sentry : options de build (@sentry/nuxt) ---
  // Le SDK lui-même est initialisé par sentry.client.config.ts et
  // sentry.server.config.ts, seulement si un DSN est défini.
  sentry: {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    // Pas de télémétrie du plugin de build vers Sentry.
    telemetry: false,
    // Sourcemaps générées (« hidden ») et envoyées à Sentry UNIQUEMENT si
    // SENTRY_AUTH_TOKEN est défini ; sinon build normal, sans sourcemap.
    sourcemaps: {
      disable: !process.env.SENTRY_AUTH_TOKEN
    }
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