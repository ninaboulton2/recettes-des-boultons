import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    // Environnement DOM léger par défaut (tests unitaires purs). Pour un test
    // nécessitant l'app Nuxt complète : `// @vitest-environment nuxt` en tête
    // de fichier.
    environment: 'happy-dom',
    include: ['test/**/*.{test,spec}.ts'],
    environmentOptions: {
      nuxt: {
        domEnvironment: 'happy-dom'
      }
    }
  }
})
