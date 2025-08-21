import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { username, password } = body

    // Vérifier que les credentials sont fournis
    if (!username || !password) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Nom d\'utilisateur et mot de passe requis'
      })
    }

    // Récupérer la configuration depuis les variables d'environnement
    const adminUsername = process.env.ADMIN_USERNAME || 'admin'
    const adminPassword = process.env.ADMIN_PASSWORD || 'password123'
    const jwtSecret = process.env.JWT_SECRET || 'default-secret-key'
    const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '24h'

    // Vérifier le nom d'utilisateur
    if (username !== adminUsername) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Identifiants invalides'
      })
    }

    // Vérifier le mot de passe
    if (password !== adminPassword) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Identifiants invalides'
      })
    }

    // Générer le token JWT
    const token = jwt.sign(
      { 
        userId: 'admin',
        username: adminUsername,
        role: 'admin',
        iat: Math.floor(Date.now() / 1000)
      },
      jwtSecret,
      { 
        expiresIn: jwtExpiresIn,
        issuer: 'les-boultons-app',
        audience: 'les-boultons-users'
      }
    )

    // Définir le cookie sécurisé
    setCookie(event, 'auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60, // 24 heures
      path: '/'
    })

    // Logger la connexion réussie
    console.log(`[AUTH] Connexion réussie pour ${username}`)

    // Retourner la réponse d'authentification
    return {
      user: {
        id: 'admin',
        username: adminUsername,
        role: 'admin',
        createdAt: new Date().toISOString()
      },
      token
    }
  } catch (error) {
    console.error('[AUTH] Erreur de connexion:', error)
    
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