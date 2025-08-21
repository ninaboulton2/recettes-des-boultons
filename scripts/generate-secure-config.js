#!/usr/bin/env node

/**
 * Script de génération de configuration sécurisée pour la production
 * Usage: node scripts/generate-secure-config.js
 */

const crypto = require('crypto');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Fonction pour générer une chaîne aléatoire
function generateRandomString(length, charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*') {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return result;
}

// Fonction pour générer une clé JWT sécurisée
function generateJWTSecret() {
  return crypto.randomBytes(64).toString('base64');
}

// Fonction pour valider la force d'un mot de passe
function validatePassword(password) {
  const errors = [];
  
  if (password.length < 16) {
    errors.push('Le mot de passe doit contenir au moins 16 caractères');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Le mot de passe doit contenir au moins une majuscule');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Le mot de passe doit contenir au moins une minuscule');
  }
  
  if (!/[0-9]/.test(password)) {
    errors.push('Le mot de passe doit contenir au moins un chiffre');
  }
  
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Le mot de passe doit contenir au moins un caractère spécial');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// Fonction principale
async function generateSecureConfig() {
  console.log('🔒 Génération de configuration sécurisée pour la production');
  console.log('=====================================================\n');
  
  // Générer un nom d'utilisateur sécurisé
  const secureUsername = generateRandomString(12, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789');
  
  // Générer un mot de passe sécurisé
  const securePassword = generateRandomString(20, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*');
  
  // Générer une clé JWT sécurisée
  const jwtSecret = generateJWTSecret();
  
  console.log('✅ Configuration générée avec succès:\n');
  console.log(`👤 Nom d'utilisateur admin: ${secureUsername}`);
  console.log(`🔑 Mot de passe admin: ${securePassword}`);
  console.log(`🔐 Clé JWT (${jwtSecret.length} caractères): ${jwtSecret.substring(0, 20)}...`);
  
  // Valider le mot de passe
  const passwordValidation = validatePassword(securePassword);
  if (passwordValidation.valid) {
    console.log('✅ Mot de passe conforme aux exigences de sécurité');
  } else {
    console.log('⚠️  Avertissements sur le mot de passe:');
    passwordValidation.errors.forEach(error => console.log(`   - ${error}`));
  }
  
  console.log('\n📝 Création du fichier .env de production...');
  
  // Générer le contenu du fichier .env
  const envContent = `# Configuration de production sécurisée - Générée automatiquement
# ⚠️  IMPORTANT: Gardez ce fichier secret et ne le committez jamais !

# Credentials admin
ADMIN_USERNAME=${secureUsername}
ADMIN_PASSWORD=${securePassword}

# Clé secrète JWT
JWT_SECRET=${jwtSecret}

# Configuration de l'API
API_BASE=https://votre-domaine.com

# Environnement
NODE_ENV=production

# Configuration de sécurité
MAX_LOGIN_ATTEMPTS=5
LOGIN_TIMEOUT_MINUTES=15
LOGIN_BLOCK_DURATION_MINUTES=30

# Configuration des cookies sécurisés
COOKIE_SECURE=true
COOKIE_HTTPONLY=true
COOKIE_SAMESITE=strict
COOKIE_MAX_AGE=86400000

# Configuration de sécurité supplémentaire
ENABLE_RATE_LIMITING=true
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Configuration des en-têtes de sécurité
ENABLE_SECURITY_HEADERS=true
ENABLE_CORS=false
CORS_ORIGIN=https://votre-domaine.com

# Configuration du logging de sécurité
ENABLE_SECURITY_LOGGING=true
LOG_LEVEL=warn

# ⚠️  REMINDER: Changez l'URL de l'API pour votre domaine réel !
`;
  
  // Écrire le fichier .env
  const fs = require('fs');
  const envPath = '.env.production';
  
  try {
    fs.writeFileSync(envPath, envContent);
    console.log(`✅ Fichier ${envPath} créé avec succès`);
  } catch (error) {
    console.error('❌ Erreur lors de la création du fichier:', error.message);
    return;
  }
  
  console.log('\n🔒 Configuration de sécurité terminée !');
  console.log('\n📋 Prochaines étapes:');
  console.log('1. Vérifiez le fichier .env.production généré');
  console.log('2. Modifiez l\'URL de l\'API pour votre domaine réel');
  console.log('3. Déployez avec cette configuration');
  console.log('4. Supprimez ou sécurisez ce fichier après déploiement');
  console.log('\n⚠️  ATTENTION: Ne committez JAMAIS ce fichier dans Git !');
  
  rl.close();
}

// Gestion des erreurs
process.on('uncaughtException', (error) => {
  console.error('❌ Erreur fatale:', error.message);
  process.exit(1);
});

// Lancer le script
generateSecureConfig().catch(error => {
  console.error('❌ Erreur:', error.message);
  process.exit(1);
});
