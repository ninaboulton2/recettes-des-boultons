import * as Sentry from '@sentry/nuxt'

/**
 * Sentry côté serveur (Nitro). Le module `@sentry/nuxt` (v11+) intègre ce
 * fichier au bundle serveur et l'exécute au démarrage : aucun `node --import`
 * à ajouter (fonctions Vercel comprises). Seul `process.env` est disponible
 * ici (pas de `useRuntimeConfig()`).
 *
 * DSN absent : SDK non initialisé (aucune requête). Les erreurs non gérées
 * des handlers (500) sont capturées par le hook Nitro `error` du module ;
 * les 4xx sont ignorées.
 */
const dsn = process.env.NUXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN
const environment = process.env.VERCEL_ENV || 'development'

if (dsn) {
  Sentry.init({
    dsn,
    environment,
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
