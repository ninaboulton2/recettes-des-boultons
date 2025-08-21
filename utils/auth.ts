import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

// Fonction pour vérifier les credentials admin
export const verifyAdminCredentials = async (username: string, password: string): Promise<boolean> => {
  const adminUsername = process.env.ADMIN_USERNAME || 'admin'
  const adminPassword = process.env.ADMIN_PASSWORD || 'password123'
  
  return username === adminUsername && password === adminPassword
}

// Fonction pour générer un token JWT sécurisé
export const generateToken = (payload: any): string => {
  const jwtSecret = process.env.JWT_SECRET || 'default-secret-key'
  const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '24h'
  
  return jwt.sign(payload, jwtSecret, { 
    expiresIn: jwtExpiresIn,
    issuer: 'les-boultons-app',
    audience: 'les-boultons-users'
  })
}

// Fonction pour vérifier un token JWT
export const verifyToken = (token: string): any => {
  try {
    const jwtSecret = process.env.JWT_SECRET || 'default-secret-key'
    
    return jwt.verify(token, jwtSecret, {
      issuer: 'les-boultons-app',
      audience: 'les-boultons-users'
    })
  } catch (error) {
    console.warn('[AUTH] Erreur de vérification du token:', error)
    return null
  }
}

// Fonction pour hasher un mot de passe (pour la configuration initiale)
export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, 12) // Augmenter le coût du hachage
}

// Fonction pour vérifier un mot de passe hashé
export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash)
}

// Fonction pour vérifier si un utilisateur est admin
export const isAdmin = (token: string): boolean => {
  const decoded = verifyToken(token)
  return decoded && decoded.role === 'admin'
}

// Fonction pour valider la force d'un mot de passe
export const validatePasswordStrength = (password: string): { valid: boolean; errors: string[] } => {
  const errors: string[] = []
  
  if (password.length < 12) {
    errors.push('Le mot de passe doit contenir au moins 12 caractères')
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Le mot de passe doit contenir au moins une majuscule')
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Le mot de passe doit contenir au moins une minuscule')
  }
  
  if (!/[0-9]/.test(password)) {
    errors.push('Le mot de passe doit contenir au moins un chiffre')
  }
  
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Le mot de passe doit contenir au moins un caractère spécial')
  }
  
  return {
    valid: errors.length === 0,
    errors
  }
}

// Fonction pour générer une clé JWT sécurisée
export const generateSecureJWTSecret = (): string => {
  return require('crypto').randomBytes(64).toString('base64')
}

// Fonction pour vérifier la configuration de sécurité
export const checkSecurityConfiguration = (): { secure: boolean; warnings: string[] } => {
  const warnings: string[] = []
  const authConfig = getAuthConfig()
  const cookieConfig = getCookieConfig()
  
  if (!authConfig.jwtSecret || authConfig.jwtSecret.length < 64) {
    warnings.push('La clé JWT doit contenir au moins 64 caractères')
  }
  
  if (process.env.NODE_ENV === 'production') {
    if (!cookieConfig.secure) {
      warnings.push('Les cookies doivent être sécurisés en production (HTTPS requis)')
    }
    
    if (!cookieConfig.httpOnly) {
      warnings.push('Les cookies doivent être HttpOnly en production')
    }
  }
  
  return {
    secure: warnings.length === 0,
    warnings
  }
} 