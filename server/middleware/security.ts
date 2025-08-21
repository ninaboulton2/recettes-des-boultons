import { getSecurityConfig } from '~/config/env'

// Middleware côté serveur pour les en-têtes de sécurité
export default defineEventHandler((event) => {
  const securityConfig = getSecurityConfig()
  
  // Ajouter des en-têtes de sécurité
  if (securityConfig.enableSecurityHeaders) {
    setHeader(event, 'X-Content-Type-Options', 'nosniff')
    setHeader(event, 'X-Frame-Options', 'DENY')
    setHeader(event, 'X-XSS-Protection', '1; mode=block')
    setHeader(event, 'Referrer-Policy', 'strict-origin-when-cross-origin')
    setHeader(event, 'Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    
    // HSTS en production uniquement
    if (process.env.NODE_ENV === 'production') {
      setHeader(event, 'Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
    }
  }
  
  // Gestion CORS
  if (!securityConfig.enableCors) {
    setHeader(event, 'Access-Control-Allow-Origin', 'null')
    setHeader(event, 'Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    setHeader(event, 'Access-Control-Allow-Headers', 'Content-Type, Authorization')
  }
})
