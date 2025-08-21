#!/usr/bin/env node

/**
 * Script pour générer des credentials sécurisés pour la production
 * Usage: node scripts/generate-credentials.js
 */

const crypto = require('crypto')
const bcrypt = require('bcryptjs')

function generateSecurePassword(length = 16) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?'
  let password = ''
  
  // Assurer au moins un caractère de chaque type
  password += charset[Math.floor(Math.random() * 26)] // Majuscule
  password += charset[26 + Math.floor(Math.random() * 26)] // Minuscule
  password += charset[52 + Math.floor(Math.random() * 10)] // Chiffre
  password += charset[62 + Math.floor(Math.random() * 32)] // Caractère spécial
  
  // Remplir le reste avec des caractères aléatoires
  for (let i = 4; i < length; i++) {
    password += charset[Math.floor(Math.random() * charset.length)]
  }
  
  // Mélanger le mot de passe
  return password.split('').sort(() => Math.random() - 0.5).join('')
}

function generateJWTSecret(length = 64) {
  return crypto.randomBytes(length).toString('hex')
}

async function generateCredentials() {
  console.log('🔐 Génération de credentials sécurisés pour la production\n')
  
  try {
    // Générer un nom d'utilisateur sécurisé
    const username = 'admin_' + crypto.randomBytes(8).toString('hex')
    
    // Générer un mot de passe sécurisé
    const password = generateSecurePassword(20)
    
    // Générer une clé JWT sécurisée
    const jwtSecret = generateJWTSecret(64)
    
    // Hasher le mot de passe
    const hashedPassword = await bcrypt.hash(password, 12)
    
    console.log('✅ Credentials générés avec succès:\n')
    console.log(`👤 Nom d'utilisateur: ${username}`)
    console.log(`🔑 Mot de passe: ${password}`)
    console.log(`🔒 Hash du mot de passe: ${hashedPassword}`)
    console.log(`🔐 Clé JWT secrète: ${jwtSecret}`)
    
    console.log('\n📝 Configuration à ajouter dans votre fichier .env:\n')
    console.log(`ADMIN_USERNAME=${username}`)
    console.log(`ADMIN_PASSWORD=${password}`)
    console.log(`JWT_SECRET=${jwtSecret}`)
    
    console.log('\n⚠️  IMPORTANT:')
    console.log('- Sauvegardez ces informations dans un endroit sécurisé')
    console.log('- Ne partagez jamais ces credentials')
    console.log('- Changez le mot de passe régulièrement')
    console.log('- Utilisez HTTPS en production')
    
    // Sauvegarder dans un fichier temporaire (optionnel)
    const fs = require('fs')
    const credentials = {
      username,
      password,
      hashedPassword,
      jwtSecret,
      generatedAt: new Date().toISOString()
    }
    
    fs.writeFileSync('credentials-temp.json', JSON.stringify(credentials, null, 2))
    console.log('\n💾 Credentials sauvegardés dans credentials-temp.json')
    console.log('   (Supprimez ce fichier après utilisation)')
    
  } catch (error) {
    console.error('\n❌ Erreur lors de la génération:', error.message)
    process.exit(1)
  }
}

// Exécuter si le script est appelé directement
if (require.main === module) {
  generateCredentials()
}

module.exports = { generateCredentials, generateSecurePassword, generateJWTSecret } 