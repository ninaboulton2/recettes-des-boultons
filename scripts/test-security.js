#!/usr/bin/env node

/**
 * Script de test de sécurité pour vérifier la configuration
 * Usage: node scripts/test-security.js
 */

const fs = require('fs');
const path = require('path');

// Couleurs pour la console
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logHeader(title) {
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`  ${title}`, 'cyan');
  log(`${'='.repeat(60)}`, 'cyan');
}

function logSection(title) {
  log(`\n${'-'.repeat(40)}`, 'blue');
  log(`  ${title}`, 'blue');
  log(`${'-'.repeat(40)}`, 'blue');
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

// Tests de sécurité
class SecurityTester {
  constructor() {
    this.results = {
      passed: 0,
      warnings: 0,
      failed: 0,
      total: 0
    };
  }

  // Test 1: Vérifier la présence des fichiers de configuration
  testConfigurationFiles() {
    logSection('Test des fichiers de configuration');
    
    const requiredFiles = [
      'config/auth.config.ts',
      'config/env.ts',
      'middleware/auth.ts',
      'middleware/security.global.ts',
      'stores/security.ts',
      'utils/auth.ts'
    ];

    requiredFiles.forEach(file => {
      this.results.total++;
      if (fs.existsSync(file)) {
        logSuccess(`${file} présent`);
        this.results.passed++;
      } else {
        logError(`${file} manquant`);
        this.results.failed++;
      }
    });
  }

  // Test 2: Vérifier la configuration d'environnement
  testEnvironmentConfiguration() {
    logSection('Test de la configuration d\'environnement');
    
    // Vérifier si .env existe
    this.results.total++;
    if (fs.existsSync('.env')) {
      logWarning('.env détecté - vérifiez qu\'il n\'est pas commité');
      this.results.warnings++;
    } else {
      logSuccess('.env non présent (bonne pratique)');
      this.results.passed++;
    }

    // Vérifier .gitignore
    this.results.total++;
    if (fs.existsSync('.gitignore')) {
      const gitignore = fs.readFileSync('.gitignore', 'utf8');
      if (gitignore.includes('.env') && gitignore.includes('*.key')) {
        logSuccess('.gitignore protège les fichiers sensibles');
        this.results.passed++;
      } else {
        logWarning('.gitignore pourrait être amélioré');
        this.results.warnings++;
      }
    } else {
      logError('.gitignore manquant');
      this.results.failed++;
    }
  }

  // Test 3: Vérifier la configuration de sécurité
  testSecurityConfiguration() {
    logSection('Test de la configuration de sécurité');
    
    try {
      // Vérifier auth.config.ts
      const authConfig = fs.readFileSync('config/auth.config.ts', 'utf8');
      
      this.results.total++;
      if (authConfig.includes('process.env.ADMIN_USERNAME')) {
        logSuccess('Credentials admin dans les variables d\'environnement');
        this.results.passed++;
      } else {
        logError('Credentials admin en dur détectés');
        this.results.failed++;
      }

      this.results.total++;
      if (authConfig.includes('process.env.JWT_SECRET')) {
        logSuccess('Clé JWT dans les variables d\'environnement');
        this.results.passed++;
      } else {
        logError('Clé JWT en dur détectée');
        this.results.failed++;
      }

      this.results.total++;
      if (authConfig.includes('MAX_LOGIN_ATTEMPTS')) {
        logSuccess('Protection anti-brute force configurée');
        this.results.passed++;
      } else {
        logWarning('Protection anti-brute force non configurée');
        this.results.warnings++;
      }

    } catch (error) {
      logError(`Erreur lors de la lecture de la configuration: ${error.message}`);
      this.results.failed++;
    }
  }

  // Test 4: Vérifier les middlewares de sécurité
  testSecurityMiddlewares() {
    logSection('Test des middlewares de sécurité');
    
    try {
      // Vérifier auth.ts
      const authMiddleware = fs.readFileSync('middleware/auth.ts', 'utf8');
      
      this.results.total++;
      if (authMiddleware.includes('isSecureConfig')) {
        logSuccess('Validation de configuration de sécurité active');
        this.results.passed++;
      } else {
        logWarning('Validation de configuration de sécurité manquante');
        this.results.warnings++;
      }

      // Vérifier security.global.ts
      if (fs.existsSync('middleware/security.global.ts')) {
        const securityMiddleware = fs.readFileSync('middleware/security.global.ts', 'utf8');
        
        this.results.total++;
        if (securityMiddleware.includes('X-Content-Type-Options')) {
          logSuccess('En-têtes de sécurité configurés');
          this.results.passed++;
        } else {
          logWarning('En-têtes de sécurité incomplets');
          this.results.warnings++;
        }
      } else {
        logError('Middleware de sécurité global manquant');
        this.results.failed++;
      }

    } catch (error) {
      logError(`Erreur lors de la lecture des middlewares: ${error.message}`);
      this.results.failed++;
    }
  }

  // Test 5: Vérifier les stores de sécurité
  testSecurityStores() {
    logSection('Test des stores de sécurité');
    
    try {
      if (fs.existsSync('stores/security.ts')) {
        const securityStore = fs.readFileSync('stores/security.ts', 'utf8');
        
        this.results.total++;
        if (securityStore.includes('maxLoginAttempts')) {
          logSuccess('Store de sécurité avec protection anti-brute force');
          this.results.passed++;
        } else {
          logWarning('Store de sécurité incomplet');
          this.results.warnings++;
        }
      } else {
        logError('Store de sécurité manquant');
        this.results.failed++;
      }

    } catch (error) {
      logError(`Erreur lors de la lecture des stores: ${error.message}`);
      this.results.failed++;
    }
  }

  // Test 6: Vérifier les utilitaires de sécurité
  testSecurityUtils() {
    logSection('Test des utilitaires de sécurité');
    
    try {
      if (fs.existsSync('utils/auth.ts')) {
        const authUtils = fs.readFileSync('utils/auth.ts', 'utf8');
        
        this.results.total++;
        if (authUtils.includes('validatePasswordStrength')) {
          logSuccess('Validation de force des mots de passe');
          this.results.passed++;
        } else {
          logWarning('Validation de force des mots de passe manquante');
          this.results.warnings++;
        }

        this.results.total++;
        if (authUtils.includes('checkSecurityConfiguration')) {
          logSuccess('Vérification de configuration de sécurité');
          this.results.passed++;
        } else {
          logWarning('Vérification de configuration de sécurité manquante');
          this.results.warnings++;
        }
      } else {
        logError('Utilitaires d\'authentification manquants');
        this.results.failed++;
      }

    } catch (error) {
      logError(`Erreur lors de la lecture des utilitaires: ${error.message}`);
      this.results.failed++;
    }
  }

  // Test 7: Vérifier la configuration Nuxt
  testNuxtConfiguration() {
    logSection('Test de la configuration Nuxt');
    
    try {
      if (fs.existsSync('nuxt.config.ts')) {
        const nuxtConfig = fs.readFileSync('nuxt.config.ts', 'utf8');
        
        this.results.total++;
        if (nuxtConfig.includes('X-Content-Type-Options')) {
          logSuccess('En-têtes de sécurité dans la configuration Nuxt');
          this.results.passed++;
        } else {
          logWarning('En-têtes de sécurité manquants dans Nuxt');
          this.results.warnings++;
        }
      } else {
        logError('Configuration Nuxt manquante');
        this.results.failed++;
      }

    } catch (error) {
      logError(`Erreur lors de la lecture de la configuration Nuxt: ${error.message}`);
      this.results.failed++;
    }
  }

  // Afficher le résumé des tests
  showResults() {
    logHeader('RÉSULTATS DES TESTS DE SÉCURITÉ');
    
    log(`\n📊 Résumé:`, 'cyan');
    log(`   Tests réussis: ${this.results.passed}`, 'green');
    log(`   Avertissements: ${this.results.warnings}`, 'yellow');
    log(`   Tests échoués: ${this.results.failed}`, 'red');
    log(`   Total: ${this.results.total}`, 'blue');
    
    const successRate = ((this.results.passed / this.results.total) * 100).toFixed(1);
    log(`\n📈 Taux de réussite: ${successRate}%`, 'cyan');
    
    if (this.results.failed === 0 && this.results.warnings <= 2) {
      log(`\n🎉 Système de sécurité prêt pour la production !`, 'green');
    } else if (this.results.failed === 0) {
      log(`\n⚠️  Système de sécurité acceptable avec quelques améliorations recommandées`, 'yellow');
    } else {
      log(`\n🚨 Système de sécurité nécessite des corrections avant la production`, 'red');
    }
    
    // Recommandations
    if (this.results.failed > 0 || this.results.warnings > 0) {
      log(`\n📋 Recommandations:`, 'cyan');
      
      if (this.results.failed > 0) {
        log(`   - Corriger les erreurs critiques avant le déploiement`, 'red');
      }
      
      if (this.results.warnings > 0) {
        log(`   - Améliorer les points d'avertissement pour une sécurité optimale`, 'yellow');
      }
      
      log(`   - Utiliser le script generate-secure-config.js pour une configuration optimale`, 'blue');
      log(`   - Tester toutes les fonctionnalités de sécurité après correction`, 'blue');
    }
  }

  // Exécuter tous les tests
  runAllTests() {
    logHeader('DÉMARRAGE DES TESTS DE SÉCURITÉ');
    
    this.testConfigurationFiles();
    this.testEnvironmentConfiguration();
    this.testSecurityConfiguration();
    this.testSecurityMiddlewares();
    this.testSecurityStores();
    this.testSecurityUtils();
    this.testNuxtConfiguration();
    
    this.showResults();
  }
}

// Lancer les tests
if (require.main === module) {
  const tester = new SecurityTester();
  tester.runAllTests();
}

module.exports = SecurityTester;
