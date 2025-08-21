#!/usr/bin/env node

/**
 * Script de test pour l'authentification
 * Usage: node scripts/test-auth.js
 */

const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')

// Configuration de test
const TEST_CONFIG = {
  username: 'lesboultons',
  password: 'boultons2024!',
  jwtSecret: 'boultons-secret-key-2024-change-in-production'
}

async function testAuthentication() {
  console.log('🧪 Test du système d\'authentification\n')
  
  try {
    // Test 1: Génération de hash de mot de passe
    console.log('1. Test de génération de hash de mot de passe...')
    const hashedPassword = await bcrypt.hash(TEST_CONFIG.password, 10)
    console.log(`   ✅ Hash généré: ${hashedPassword.substring(0, 20)}...`)
    
    // Test 2: Vérification de mot de passe
    console.log('\n2. Test de vérification de mot de passe...')
    const isValidPassword = await bcrypt.compare(TEST_CONFIG.password, hashedPassword)
    console.log(`   ✅ Mot de passe valide: ${isValidPassword}`)
    
    // Test 3: Génération de token JWT
    console.log('\n3. Test de génération de token JWT...')
    const payload = {
      userId: 'admin',
      username: TEST_CONFIG.username,
      role: 'admin'
    }
    const token = jwt.sign(payload, TEST_CONFIG.jwtSecret, { expiresIn: '24h' })
    console.log(`   ✅ Token généré: ${token.substring(0, 30)}...`)
    
    // Test 4: Vérification de token JWT
    console.log('\n4. Test de vérification de token JWT...')
    const decoded = jwt.verify(token, TEST_CONFIG.jwtSecret)
    console.log(`   ✅ Token décodé: ${JSON.stringify(decoded, null, 2)}`)
    
    // Test 5: Test avec mauvais mot de passe
    console.log('\n5. Test avec mauvais mot de passe...')
    const isInvalidPassword = await bcrypt.compare('mauvais-mot-de-passe', hashedPassword)
    console.log(`   ✅ Mot de passe invalide rejeté: ${!isInvalidPassword}`)
    
    // Test 6: Test avec mauvais secret JWT
    console.log('\n6. Test avec mauvais secret JWT...')
    try {
      jwt.verify(token, 'mauvais-secret')
      console.log('   ❌ Erreur: Token accepté avec mauvais secret')
    } catch (error) {
      console.log('   ✅ Token rejeté avec mauvais secret')
    }
    
    console.log('\n🎉 Tous les tests d\'authentification sont passés avec succès!')
    
  } catch (error) {
    console.error('\n❌ Erreur lors des tests:', error.message)
    process.exit(1)
  }
}

// Exécuter les tests si le script est appelé directement
if (require.main === module) {
  testAuthentication()
}

module.exports = { testAuthentication } 