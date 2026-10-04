import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    // Environnement DOM léger par défaut (tests unitaires purs). Pour un test
    // nécessitant l'app Nuxt complète : `// @vitest-environment nuxt` en tête
    // de fichier.
    environment: 'happy-dom',
    // Les parcours de bout en bout (e2e/) relèvent de Playwright, pas de Vitest.
    include: ['test/**/*.{test,spec}.ts'],
    environmentOptions: {
      nuxt: {
        domEnvironment: 'happy-dom'
      }
    },
    // `npm run test:coverage` : rapport indicatif, AUCUN seuil bloquant.
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'text', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['app/**/*.{ts,vue}', 'server/**/*.ts', 'shared/**/*.ts'],
      exclude: ['shared/types/database.ts', '**/*.d.ts']
    }
  }
})
