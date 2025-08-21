import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { getAuthConfig, getCookieConfig, getSecurityConfig } from '~/config/env'

// Store en mémoire pour les tentatives de connexion (en production, utilisez Redis)
const loginAttempts = new Map<string, { count: number; lastAttempt: number; blockedUntil?: number }>()

// Fonction helper pour obtenir l'IP du client
function getClientIP(event: any): string {
  // Essayer différentes sources pour l'IP client
  const forwardedFor = getHeader(event, 'x-forwarded-for')
  const realIP = getHeader(event, 'x-real-ip')
  const remoteAddress = event.node?.req?.socket?.remoteAddress
  
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim()
  }
  
  if (realIP) {
    return realIP
  }
  
  if (remoteAddress) {
    return remoteAddress
  }
  
  return 'unknown'
}

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

    // Récupérer la configuration
    const authConfig = getAuthConfig()
    const cookieConfig = getCookieConfig()
    const securityConfig = getSecurityConfig()

    // Vérifier que la configuration est valide
    if (!authConfig.adminUsername || !authConfig.adminPassword || !authConfig.jwtSecret) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Configuration d\'authentification manquante'
      })
    }

    // Vérifier la configuration de sécurité en production
    if (process.env.NODE_ENV === 'production') {
      if (authConfig.jwtSecret.length < 64) {
        throw createError({
          statusCode: 500,
          statusMessage: 'Configuration de sécurité insuffisante'
        })
      }
    }

    // Obtenir l'IP du client pour la limitation des tentatives
    const clientIP = getClientIP(event) || 'unknown'
    const userAgent = getHeader(event, 'user-agent') || 'unknown'

    // Vérifier si l'IP est bloquée
    const ipAttempts = loginAttempts.get(clientIP)
    if (ipAttempts && ipAttempts.blockedUntil && Date.now() < ipAttempts.blockedUntil) {
      const remainingMinutes = Math.ceil((ipAttempts.blockedUntil - Date.now()) / (60 * 1000))
      throw createError({
        statusCode: 429,
        statusMessage: `Trop de tentatives échouées. Réessayez dans ${remainingMinutes} minutes.`
      })
    }

    // Vérifier le nom d'utilisateur
    if (username !== authConfig.adminUsername) {
      recordFailedAttempt(clientIP)
      throw createError({
        statusCode: 401,
        statusMessage: 'Identifiants invalides'
      })
    }

    // Vérifier le mot de passe
    if (password !== authConfig.adminPassword) {
      recordFailedAttempt(clientIP)
      throw createError({
        statusCode: 401,
        statusMessage: 'Identifiants invalides'
      })
    }

    // Connexion réussie - réinitialiser les tentatives
    if (ipAttempts) {
      loginAttempts.delete(clientIP)
    }

    // Générer le token JWT
    const token = jwt.sign(
      { 
        userId: 'admin',
        username: authConfig.adminUsername,
        role: 'admin',
        iat: Math.floor(Date.now() / 1000)
      },
      authConfig.jwtSecret,
      { 
        expiresIn: authConfig.jwtExpiresIn,
        issuer: 'les-boultons-app',
        audience: 'les-boultons-users'
      }
    )

    // Définir le cookie sécurisé
    setCookie(event, 'auth_token', token, {
      httpOnly: cookieConfig.httpOnly,
      secure: cookieConfig.secure,
      sameSite: cookieConfig.sameSite,
      maxAge: cookieConfig.maxAge / 1000,
      path: '/'
    })

    // Logger la connexion réussie
    console.log(`[AUTH] Connexion réussie pour ${username} depuis ${clientIP}`)

    // Retourner la réponse d'authentification
    return {
      user: {
        id: 'admin',
        username: authConfig.adminUsername,
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

// Fonction pour enregistrer une tentative échouée
function recordFailedAttempt(clientIP: string) {
  const securityConfig = getSecurityConfig()
  const now = Date.now()
  
  const attempts = loginAttempts.get(clientIP) || { count: 0, lastAttempt: now }
  attempts.count++
  attempts.lastAttempt = now
  
  // Bloquer l'IP si trop de tentatives
  if (attempts.count >= securityConfig.maxLoginAttempts) {
    attempts.blockedUntil = now + (securityConfig.loginBlockDurationMinutes * 60 * 1000)
    console.warn(`[SECURITY] IP ${clientIP} bloquée pour ${securityConfig.loginBlockDurationMinutes} minutes`)
  }
  
  loginAttempts.set(clientIP, attempts)
  
  // Nettoyer les anciennes entrées
  cleanupOldAttempts()
}

// Fonction pour nettoyer les anciennes tentatives
function cleanupOldAttempts() {
  const securityConfig = getSecurityConfig()
  const cutoff = Date.now() - (securityConfig.rateLimitWindowMs * 2)
  
  for (const [ip, attempts] of loginAttempts.entries()) {
    if (attempts.lastAttempt < cutoff && !attempts.blockedUntil) {
      loginAttempts.delete(ip)
    }
  }
} 