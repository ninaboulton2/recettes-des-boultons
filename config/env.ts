// Configuration des variables d'environnement sécurisées
export const envConfig = {
  // Configuration d'authentification
  auth: {
    adminUsername: process.env.ADMIN_USERNAME || '',
    adminPassword: process.env.ADMIN_PASSWORD || '',
    jwtSecret: process.env.JWT_SECRET || '',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
    jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
  },
  
  // Configuration de sécurité
  security: {
    maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5'),
    loginTimeoutMinutes: parseInt(process.env.LOGIN_TIMEOUT_MINUTES || '15'),
    loginBlockDurationMinutes: parseInt(process.env.LOGIN_BLOCK_DURATION_MINUTES || '30'),
    enableRateLimiting: process.env.ENABLE_RATE_LIMITING === 'true',
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
    rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100')
  },
  
  // Configuration des cookies
  cookies: {
    secure: process.env.COOKIE_SECURE === 'true',
    httpOnly: process.env.COOKIE_HTTPONLY === 'true',
    sameSite: process.env.COOKIE_SAMESITE || 'strict',
    maxAge: parseInt(process.env.COOKIE_MAX_AGE || '86400000')
  },
  
  // Configuration de l'API
  api: {
    baseUrl: process.env.API_BASE || 'http://localhost:3001',
    enableCors: process.env.ENABLE_CORS === 'true',
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000'
  },
  
  // Configuration de l'application
  app: {
    name: 'Les Boultons - Recettes',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  },
  
  // Configuration du logging
  logging: {
    enableSecurityLogging: process.env.ENABLE_SECURITY_LOGGING === 'true',
    logLevel: process.env.LOG_LEVEL || 'info'
  }
}

// Fonction pour vérifier si l'environnement est en production
export const isProduction = () => envConfig.app.environment === 'production'

// Fonction pour obtenir la configuration d'authentification
export const getAuthConfig = () => envConfig.auth

// Fonction pour obtenir la configuration de sécurité
export const getSecurityConfig = () => envConfig.security

// Fonction pour obtenir la configuration des cookies
export const getCookieConfig = () => envConfig.cookies

// Fonction pour obtenir la configuration de l'API
export const getApiConfig = () => envConfig.api

// Fonction pour vérifier si la configuration est sécurisée
export const isSecureConfig = (): boolean => {
  if (isProduction()) {
    return !!(
      envConfig.auth.adminUsername &&
      envConfig.auth.adminPassword &&
      envConfig.auth.jwtSecret &&
      envConfig.auth.jwtSecret.length >= 64 &&
      envConfig.cookies.secure &&
      envConfig.cookies.httpOnly
    )
  }
  return true // En développement, on est moins strict
}

// Fonction pour obtenir des informations de configuration masquées (pour le logging)
export const getMaskedConfig = () => ({
  ...envConfig,
  auth: {
    ...envConfig.auth,
    adminUsername: envConfig.auth.adminUsername ? '***' : 'NOT_SET',
    adminPassword: envConfig.auth.adminPassword ? '***' : 'NOT_SET',
    jwtSecret: envConfig.auth.jwtSecret ? 
      `${envConfig.auth.jwtSecret.substring(0, 8)}...` : 'NOT_SET'
  }
}) 