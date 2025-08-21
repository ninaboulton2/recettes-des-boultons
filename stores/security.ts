import { defineStore } from 'pinia'
import { getSecurityConfig } from '~/config/env'

interface LoginAttempt {
  timestamp: number
  ip?: string
  userAgent?: string
}

interface SecurityState {
  loginAttempts: LoginAttempt[]
  isBlocked: boolean
  blockUntil: number | null
  failedAttempts: number
}

export const useSecurityStore = defineStore('security', {
  state: (): SecurityState => ({
    loginAttempts: [],
    isBlocked: false,
    blockUntil: null,
    failedAttempts: 0
  }),

  getters: {
    canAttemptLogin: (state): boolean => {
      if (!state.isBlocked) return true
      return state.blockUntil ? Date.now() > state.blockUntil : true
    },
    
    remainingAttempts: (state): number => {
      const config = getSecurityConfig()
      return Math.max(0, config.maxLoginAttempts - state.failedAttempts)
    },
    
    isRateLimited: (state): boolean => {
      const config = getSecurityConfig()
      const now = Date.now()
      const windowStart = now - config.rateLimitWindowMs
      
      // Compter les tentatives dans la fenêtre de temps
      const recentAttempts = state.loginAttempts.filter(
        attempt => attempt.timestamp > windowStart
      )
      
      return recentAttempts.length >= config.rateLimitMaxRequests
    }
  },

  actions: {
    recordLoginAttempt(success: boolean, ip?: string, userAgent?: string) {
      const attempt: LoginAttempt = {
        timestamp: Date.now(),
        ip,
        userAgent
      }
      
      this.loginAttempts.push(attempt)
      
      if (!success) {
        this.failedAttempts++
        this.checkForBlock()
      } else {
        // Réinitialiser les compteurs en cas de succès
        this.failedAttempts = 0
        this.isBlocked = false
        this.blockUntil = null
      }
      
      // Nettoyer les anciennes tentatives
      this.cleanupOldAttempts()
      
      // Logger l'événement de sécurité
      this.logSecurityEvent(success ? 'LOGIN_SUCCESS' : 'LOGIN_FAILED', attempt)
    },
    
    checkForBlock() {
      const config = getSecurityConfig()
      
      if (this.failedAttempts >= config.maxLoginAttempts) {
        this.isBlocked = true
        this.blockUntil = Date.now() + (config.loginBlockDurationMinutes * 60 * 1000)
        
        this.logSecurityEvent('LOGIN_BLOCKED', {
          timestamp: Date.now(),
          reason: 'Too many failed attempts',
          blockDuration: config.loginBlockDurationMinutes
        })
      }
    },
    
    cleanupOldAttempts() {
      const config = getSecurityConfig()
      const cutoff = Date.now() - (config.rateLimitWindowMs * 2)
      
      this.loginAttempts = this.loginAttempts.filter(
        attempt => attempt.timestamp > cutoff
      )
    },
    
    resetSecurityState() {
      this.loginAttempts = []
      this.isBlocked = false
      this.blockUntil = null
      this.failedAttempts = 0
    },
    
    logSecurityEvent(event: string, data: any) {
      const config = getSecurityConfig()
      
      if (config.enableSecurityLogging) {
        console.warn(`[SECURITY] ${event}:`, {
          timestamp: new Date().toISOString(),
          event,
          data,
          config: getSecurityConfig()
        })
      }
    },
    
    // Vérifier si une tentative de connexion est autorisée
    canProceedWithLogin(): { allowed: boolean; reason?: string } {
      if (this.isBlocked && this.blockUntil && Date.now() < this.blockUntil) {
        const remainingMinutes = Math.ceil((this.blockUntil - Date.now()) / (60 * 1000))
        return {
          allowed: false,
          reason: `Trop de tentatives échouées. Réessayez dans ${remainingMinutes} minutes.`
        }
      }
      
      if (this.isRateLimited) {
        return {
          allowed: false,
          reason: 'Trop de requêtes. Veuillez ralentir.'
        }
      }
      
      return { allowed: true }
    }
  }
})
