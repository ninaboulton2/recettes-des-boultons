export default defineAppConfig({
  ui: {
    // Les alias Nuxt UI pointent sur nos palettes définies dans
    // app/assets/css/main.css (@theme --color-primary-* / --color-secondary-*).
    colors: {
      primary: 'primary',
      secondary: 'secondary',
      neutral: 'slate'
    }
  }
})
