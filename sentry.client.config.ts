import * as Sentry from '@sentry/nuxt'

/**
 * Sentry côté navigateur (chargé par le module `@sentry/nuxt` dans un plugin
 * Nuxt : `useRuntimeConfig()` est disponible).
 *
 * DSN absent (`NUXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN` non définis) : le SDK
 * n'est PAS initialisé → aucune requête, aucune instrumentation.
 * Pas de Session Replay (vie privée, quota du plan gratuit).
 */
const { dsn, environment } = useRuntimeConfig().public.sentry

if (dsn) {
  Sentry.init({
    dsn,
    environment,
    // Échantillon de traces : 10 % en production, aucune ailleurs.
    tracesSampleRate: environment === 'production' ? 0.1 : 0,
    // Vie privée : ni identité, ni cookies (jeton de session Supabase), ni
    // en-têtes, corps de requête, paramètres d'URL (?code= OAuth) ou
    // variables locales envoyés à Sentry.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
      genAI: { inputs: false, outputs: false }
    }
  })
}
