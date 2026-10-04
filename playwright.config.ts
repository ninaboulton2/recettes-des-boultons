import { defineConfig, devices } from '@playwright/test'
import { assertLocalSupabase } from './e2e/support/env'

/**
 * Tests de bout en bout (Playwright) contre la base Supabase LOCALE.
 *
 *   npm run test:e2e        tous les parcours (chromium desktop + Pixel 7)
 *   npm run test:e2e:ui     mode interactif
 *
 * Serveur testé (variable E2E_SERVER) :
 *   dev     (défaut en local) `nuxt dev --dotenv .env.local` sur le port 3042,
 *           réutilisé s'il tourne déjà ;
 *   preview (défaut en CI)    build existant (`NITRO_PRESET=node-server
 *           npm run build -- --dotenv .env.local`) servi par Node.
 * E2E_BASE_URL : viser un serveur déjà lancé ailleurs (aucun webServer).
 *
 * Les données créées sont préfixées `E2E_` et supprimées (projet `cleanup`).
 */
assertLocalSupabase()

const PORT = Number(process.env.E2E_PORT ?? 3042)
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`
const serverMode = process.env.E2E_SERVER ?? (process.env.CI ? 'preview' : 'dev')
const isCI = !!process.env.CI

export default defineConfig({
  testDir: './e2e',
  outputDir: 'test-results/artifacts',
  // Une seule base partagée (et de vraies données en local) : exécution en série.
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  // `nuxt dev` compile les pages à la première visite.
  timeout: serverMode === 'dev' ? 90_000 : 45_000,
  expect: { timeout: serverMode === 'dev' ? 15_000 : 10_000 },
  reporter: isCI
    ? [['github'], ['list'], ['html', { outputFolder: 'test-results/report', open: 'never' }]]
    : [['list'], ['html', { outputFolder: 'test-results/report', open: 'never' }]],
  use: {
    baseURL,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    { name: 'data', testMatch: /data\.setup\.ts/, teardown: 'cleanup' },
    { name: 'cleanup', testMatch: /data\.teardown\.ts/ },
    { name: 'auth', testMatch: /auth\.setup\.ts/, use: { ...devices['Desktop Chrome'] } },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['data', 'auth']
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      dependencies: ['data', 'auth']
    }
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: serverMode === 'preview'
          ? 'node --env-file=.env.local .output/server/index.mjs'
          : `npx nuxt dev --dotenv .env.local --port ${PORT}`,
        env: { PORT: String(PORT), NUXT_TELEMETRY_DISABLED: '1' },
        url: baseURL,
        reuseExistingServer: !isCI && serverMode === 'dev',
        timeout: 180_000,
        stdout: 'ignore',
        stderr: 'pipe'
      }
})
