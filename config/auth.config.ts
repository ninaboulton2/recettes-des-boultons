// Configuration d'authentification sécurisée
export const authConfig = {
  // Configuration des tentatives de connexion
  login: {
    maxAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5'),
    timeoutMinutes: parseInt(process.env.LOGIN_TIMEOUT_MINUTES || '15'),
    blockDurationMinutes: parseInt(process.env.LOGIN_BLOCK_DURATION_MINUTES || '30')
  },
  
  // Configuration JWT
  jwt: {
    secret: process.env.JWT_SECRET || '',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
  },
  
  // Configuration des cookies
  cookies: {
    secure: process.env.COOKIE_SECURE === 'true',
    httpOnly: process.env.COOKIE_HTTPONLY === 'true',
    sameSite: process.env.COOKIE_SAMESITE || 'strict',
    maxAge: parseInt(process.env.COOKIE_MAX_AGE || '86400000')
  },
  
  // Routes protégées nécessitant une authentification admin
  protectedRoutes: [
    '/recettes/ajouter',
    '/recettes/modifier',
    '/api/add-recipe',
    '/api/update-recipe',
    '/api/delete-recipe',
    '/api/toggle-favorite',
    '/planning',
    '/favoris'
  ],
  
  // Routes d'API publiques (pas de protection)
  publicApiRoutes: [
    '/api/auth/login',
    '/api/auth/refresh'
  ]
}

// Fonction pour vérifier si une route nécessite une authentification
export const isProtectedRoute = (path: string): boolean => {
  return authConfig.protectedRoutes.some(route => path.startsWith(route))
}

// Fonction pour vérifier si une route d'API est publique
export const isPublicApiRoute = (path: string): boolean => {
  return authConfig.publicApiRoutes.some(route => path.startsWith(route))
}

// Fonction pour vérifier si la configuration est valide pour la production
export const isProductionReady = (): boolean => {
  return !!(
    process.env.ADMIN_USERNAME &&
    process.env.ADMIN_PASSWORD &&
    process.env.JWT_SECRET &&
    process.env.JWT_SECRET.length >= 64 &&
    process.env.NODE_ENV === 'production'
  )
} 