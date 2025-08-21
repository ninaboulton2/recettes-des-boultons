// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },
  devServer: {
    port: 3001
  },
  modules: [
    '@nuxtjs/tailwindcss',
    '@pinia/nuxt',
    '@nuxtjs/color-mode',
    '@nuxt/image',
    '@nuxtjs/i18n'
  ],
  css: [
    '~/assets/css/main.css'
  ],
  i18n: {
    locales: [
      {
        code: 'fr',
        iso: 'fr-FR',
        name: 'Français',
        file: 'fr.json'
      },
      {
        code: 'en',
        iso: 'en-US',
        name: 'English',
        file: 'en.json'
      }
    ],
    defaultLocale: 'fr',
    strategy: 'prefix_except_default',
    langDir: 'locales/',
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'i18n_redirected',
      redirectOn: 'root'
    }
  },
  app: {
    head: {
      title: 'Recettes des Boultons',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Retrouvez ici toutes les recettes préférées des Boultons !' },
        // En-têtes de sécurité
        { 'http-equiv': 'X-Content-Type-Options', content: 'nosniff' },
        { 'http-equiv': 'X-Frame-Options', content: 'DENY' },
        { 'http-equiv': 'X-XSS-Protection', content: '1; mode=block' },
        { 'http-equiv': 'Referrer-Policy', content: 'strict-origin-when-cross-origin' },
        { 'http-equiv': 'Permissions-Policy', content: 'camera=(), microphone=(), geolocation=()' }
      ],
      link: [
        { rel: 'icon', type: 'image/png', href: '/images/logo.png' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        { href: 'https://fonts.googleapis.com/css2?family=Lobster&family=Poppins:wght@400;600;700&display=swap', rel: 'stylesheet' }
      ]
    }
  },
  colorMode: {
    preference: 'light',
    fallback: 'light'
  },
  image: {
    quality: 80,
    format: ['webp', 'jpg', 'png']
  },
  runtimeConfig: {
    public: {
      apiBase: process.env.API_BASE || 'http://localhost:3000'
    }
  },
  nitro: {
    compatibilityDate: '2025-06-30',
    // Configuration de sécurité Nitro
    security: {
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
      }
    }
  },
  // Configuration de sécurité supplémentaire
  experimental: {
    // Désactiver les fonctionnalités expérimentales en production
    payloadExtraction: process.env.NODE_ENV !== 'production'
  }
}) 