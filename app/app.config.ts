export default defineAppConfig({
  ui: {
    // `primary` pointe sur la palette terracotta définie dans
    // app/assets/css/main.css (@theme --color-primary-*) ; neutre chaud `stone`.
    colors: {
      primary: 'primary',
      neutral: 'stone'
    },
    // Cartes et modales : bordure fine, pas d'ombre portée.
    card: {
      slots: {
        root: 'rounded-xl shadow-none'
      }
    },
    modal: {
      slots: {
        content: 'rounded-xl shadow-none'
      }
    }
  }
})
