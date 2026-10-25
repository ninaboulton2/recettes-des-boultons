import { defineConfig, devices } from '@playwright/test'
import { assertLocalSupabase } from './e2e/support/env'

/**
 * Parcours e2e de la v2 (accueil en 3 écrans, thèmes, catégories, navigation, bannières).
 *
 *   npm run db:local:v2      base locale en état v2 (comptes nouveau@ / ami@ / user@ / admin@local.test)
 *   npm run test:e2e:v2
 *
 * Serveur : `nuxt dev --dotenv .env.local` avec NUXT_PUBLIC_V2=true, port 3043 (E2E_V2_PORT), réutilisé s'il tourne
 * déjà. NE PAS lancer ces parcours sur une base en état v1, ni les e2e v1 (`npm run test:e2e`) sur la base v2.
 * Les données créées sont préfixées `E2E_` et supprimées par les tests eux-mêmes.
 */
assertLocalSupabase()

const PORT = Number(process.env.E2E_V2_PORT ?? 3043)
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e/v2',
  outputDir: 'test-results/artifacts-v2',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { outputFolder: 'test-results/report-v2', open: 'never' }]],
  use: {
    baseURL,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [{ name: 'chromium-v2', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx nuxt dev --dotenv .env.local --port ${PORT}`,
        // SITE_URL : adresse canonique factice (parcours v2-mf4 / v2-mf5 : redirection de l'ancien alias, balise canonical).
        env: { PORT: String(PORT), NUXT_TELEMETRY_DISABLED: '1', NUXT_PUBLIC_V2: 'true', SITE_URL: process.env.E2E_SITE_URL ?? 'https://familycookbook.test' },
        url: baseURL,
        reuseExistingServer: true,
        timeout: 180_000,
        stdout: 'ignore',
        stderr: 'pipe'
      }
})
