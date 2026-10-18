import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    // Environnement DOM léger par défaut (tests unitaires purs). Pour un test
    // nécessitant l'app Nuxt complète : `// @vitest-environment nuxt` en tête
    // de fichier.
    environment: 'happy-dom',
    // Les parcours de bout en bout (e2e/) relèvent de Playwright, pas de Vitest.
    include: ['test/**/*.{test,spec}.ts'],
    // Fichiers en série : les tests d'intégration (test/integration/*.local.test.ts)
    // partagent la même base locale, les mêmes comptes et comptent des lignes
    // `ai_usage` par fonctionnalité ; en parallèle ils se faussent mutuellement
    // (et les tests d'environnement Nuxt dépassent plus facilement leur délai).
    // ~20 s au total, intégration comprise.
    fileParallelism: false,
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
