import jwt from 'jsonwebtoken'

export default defineEventHandler(async (event) => {
  try {
    // Récupérer la configuration depuis les variables d'environnement
    const jwtSecret = process.env.JWT_SECRET || 'default-secret-key'

    // Essayer d'abord de récupérer le token depuis le cookie
    let token = getCookie(event, 'auth_token')
    
    // Fallback sur l'en-tête Authorization si le cookie n'est pas disponible
    if (!token) {
      const authHeader = getHeader(event, 'authorization')
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7)
      }
    }

    if (!token) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Token d\'autorisation manquant'
      })
    }

    try {
      // Vérifier et décoder le token JWT
      const decoded = jwt.verify(token, jwtSecret, {
        issuer: 'les-boultons-app',
        audience: 'les-boultons-users'
      }) as any
      
      // Vérifier l'expiration
      if (decoded.exp && Date.now() >= decoded.exp * 1000) {
        throw new Error('Token expiré')
      }

      // Vérifier que le token contient les informations requises
      if (!decoded.userId || !decoded.username || !decoded.role) {
        throw new Error('Token invalide - informations manquantes')
      }

      // Vérifier que l'utilisateur est admin
      if (decoded.role !== 'admin') {
        throw new Error('Accès non autorisé')
      }

      // Logger l'accès réussi
      console.log(`[AUTH] Accès autorisé pour ${decoded.username}`)
      
      // Retourner les informations de l'utilisateur
      return {
        user: {
          id: decoded.userId,
          username: decoded.username,
          role: decoded.role,
          createdAt: new Date().toISOString()
        },
        token
      }
    } catch (jwtError) {
      console.warn(`[AUTH] Token invalide: ${jwtError instanceof Error ? jwtError.message : 'Unknown error'}`)
      
      // Supprimer le cookie invalide
      deleteCookie(event, 'auth_token', {
        path: '/'
      })
      
      throw createError({
        statusCode: 401,
        statusMessage: 'Token invalide ou expiré'
      })
    }
  } catch (error) {
    console.error('[AUTH] Erreur de vérification d\'authentification:', error)
    
    // Ne pas exposer les détails de l'erreur en production
    if (process.env.NODE_ENV === 'production') {
      throw createError({
        statusCode: 500,
        statusMessage: 'Erreur interne du serveur'
      })
    }
    
    throw error
  }
}) 