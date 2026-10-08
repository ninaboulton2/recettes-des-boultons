import { getEdition, localize } from './shared/editions'

// Édition lue au BUILD pour ce qui est figé dans le bundle (titre par défaut,
// manifeste PWA). Le reste suit `runtimeConfig.public.edition` à l'exécution
// (même variable NUXT_PUBLIC_EDITION) : voir DEVELOPER.md § Éditions.
const buildEdition = getEdition(process.env.NUXT_PUBLIC_EDITION)

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
    '@vite-pwa/nuxt',
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
      // Titre, description, `theme-color` et `data-edition` : posés selon
      // l'édition par app.vue et plugins/edition.ts.
      title: localize(buildEdition.brand.name, 'fr'),
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' }
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
        // Manifeste PWA généré par @vite-pwa/nuxt (clé `pwa` ci-dessous).
        { rel: 'manifest', href: '/manifest.webmanifest' }
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
    format: ['webp', 'jpg', 'png'],
    // Points de rupture Tailwind + `xs` (téléphones) pour les `sizes` mobile-first
    // des photos (`xs:100vw sm:50vw …`).
    screens: { 'xs': 320, 'sm': 640, 'md': 768, 'lg': 1024, 'xl': 1280, '2xl': 1536 },
    // Photos de recettes : URL publique du bucket Storage `recipe-photos`.
    // Domaines autorisés pour l'optimisation (ipx en dev, Vercel en prod) :
    // hôte de SUPABASE_URL (lu au build) + base Supabase locale hors Vercel.
    // Un domaine non listé n'est pas optimisé (URL d'origine). Le provider
    // `supabase` de @nuxt/image n'est pas utilisé : il exige la transformation
    // d'images, absente du plan Supabase gratuit.
    domains: [
      ...(() => {
        try {
          return [new URL(process.env.SUPABASE_URL ?? '').host]
        } catch {
          return []
        }
      })(),
      ...(process.env.VERCEL ? [] : ['127.0.0.1:54321'])
    ]
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
      // Édition du site : `boultons` (défaut, identité d'origine) ou `generic`
      // (base de la v2). Surchargeable à l'exécution par NUXT_PUBLIC_EDITION ;
      // valeur inconnue = `boultons` (shared/editions/index.ts).
      edition: process.env.NUXT_PUBLIC_EDITION || 'boultons',
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
  // Icônes de <OfflineBanner /> embarquées dans le bundle client : affichées
  // hors ligne même si elles n'ont jamais été téléchargées.
  icon: {
    clientBundle: {
      icons: ['lucide:wifi-off', 'lucide:square', 'lucide:square-check']
    }
  },
  // --- PWA (@vite-pwa/nuxt) : installable + courses hors ligne ---
  pwa: {
    registerType: 'autoUpdate',
    // Manifeste figé au build : nom et couleurs de l'édition de BUILD.
    manifest: {
      name: localize(buildEdition.brand.name, 'fr'),
      short_name: buildEdition.brand.shortName,
      description: localize(buildEdition.brand.tagline, 'fr'),
      lang: 'fr',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      theme_color: buildEdition.theme.themeColor.light,
      background_color: buildEdition.theme.backgroundColor,
      // Icônes générées par `npm run pwa:icons` (scripts/generate-pwa-icons.mjs).
      icons: [
        { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        { src: '/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ]
    },
    workbox: {
      // App rendue côté serveur : pas de page de repli précachée (« / » n'est
      // pas un fichier statique). Les pages visitées sont servies par le
      // cache « pages » ci-dessous quand le réseau manque.
      navigateFallback: null,
      // App shell : JS/CSS de Nuxt, icônes, manifeste. Les images de
      // catégories et les polices sont mises en cache à la demande.
      globPatterns: ['_nuxt/**/*.{js,css}', '*.{svg,png,ico,webmanifest}'],
      cleanupOutdatedCaches: true,
      runtimeCaching: [
        {
          // Pages HTML : réseau d'abord, cache si hors ligne (ou réseau > 4 s).
          // Exclues : callbacks d'authentification (/confirm, /reset-password)
          // et API. NB : la fonction est sérialisée dans sw.js (pas de
          // variable externe).
          urlPattern: ({ request, url }) => request.mode === 'navigate'
            && !/^\/(?:en\/)?(?:confirm|reset-password)(?:\/|$)/.test(url.pathname)
            && !url.pathname.startsWith('/api/'),
          handler: 'NetworkFirst',
          options: {
            cacheName: 'pages',
            networkTimeoutSeconds: 4,
            expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 14 },
            cacheableResponse: { statuses: [200] }
          }
        },
        {
          // Images de catégories, logo et images optimisées (@nuxt/image).
          urlPattern: ({ url, sameOrigin }) => sameOrigin && (url.pathname.startsWith('/images/') || url.pathname.startsWith('/_ipx/')),
          handler: 'StaleWhileRevalidate',
          options: {
            cacheName: 'images',
            expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 },
            cacheableResponse: { statuses: [200] }
          }
        },
        {
          // Icônes Iconify servies par @nuxt/icon (données publiques) : les
          // icônes rendues côté client restent visibles hors ligne.
          urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/api/_nuxt_icon/'),
          handler: 'StaleWhileRevalidate',
          options: {
            cacheName: 'icons',
            expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
            cacheableResponse: { statuses: [200] }
          }
        },
        {
          // Polices servies par @nuxt/fonts.
          urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/_fonts/'),
          handler: 'CacheFirst',
          options: {
            cacheName: 'fonts',
            expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
            cacheableResponse: { statuses: [200] }
          }
        }
        // Aucune règle pour Supabase (auth/v1, rest/v1, storage) ni les autres /api/** :
        // ces requêtes passent toujours par le réseau, jamais par le cache.
      ]
    },
    client: {
      // Pas de bannière d'installation imposée : le navigateur la propose.
      installPrompt: false
    },
    // Pas de service worker en `nuxt dev` (ni dans les tests e2e en dev).
    devOptions: {
      enabled: false
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