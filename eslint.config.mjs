// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

// Config ESLint Nuxt par défaut (règles stylistiques désactivées : pas de
// reformatage massif dans cette phase). Ajuster les règles ici si besoin.
export default withNuxt({
  rules: {
    // Le code historique utilise console.error/warn pour remonter les erreurs ;
    // seuls les console.log sont à bannir progressivement.
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    // Dette existante (catch (error: any) dans les endpoints) : à résorber
    // progressivement, signalée en warning plutôt qu'en erreur.
    '@typescript-eslint/no-explicit-any': 'warn',
    // Pattern Vue courant pour defineEmits (une signature par événement).
    '@typescript-eslint/unified-signatures': 'off',
    // Composants auto-importés par Nuxt (ex. Toast.vue).
    'vue/multi-word-component-names': 'off',
    // pages/recettes/[id].vue a plusieurs racines : à traiter lors de la
    // refonte des pages.
    'vue/no-multiple-template-root': 'warn',
    // Règles de pure mise en forme : pas de reformatage massif dans cette phase.
    'vue/attributes-order': 'off',
    'vue/html-self-closing': 'off'
  }
})
