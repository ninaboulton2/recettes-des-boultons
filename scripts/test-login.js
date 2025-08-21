#!/usr/bin/env node

/**
 * Script de test pour la connexion admin
 * Usage: node scripts/test-login.js
 */

const fetch = require('node-fetch')

const TEST_CREDENTIALS = {
  username: 'lesboultons',
  password: 'boultons2024!'
}

const API_BASE = 'http://localhost:3001'

async function testLogin() {
  console.log('🧪 Test de connexion admin\n')
  
  try {
    console.log('1. Test de connexion avec les credentials admin...')
    
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(TEST_CREDENTIALS)
    })

    if (response.ok) {
      const data = await response.json()
      console.log('   ✅ Connexion réussie!')
      console.log(`   👤 Utilisateur: ${data.user.username}`)
      console.log(`   🔑 Rôle: ${data.user.role}`)
      console.log(`   🎫 Token: ${data.token.substring(0, 30)}...`)
      
      // Test de vérification du token
      console.log('\n2. Test de vérification du token...')
      const verifyResponse = await fetch(`${API_BASE}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${data.token}`
        }
      })
      
      if (verifyResponse.ok) {
        const userData = await verifyResponse.json()
        console.log('   ✅ Token vérifié avec succès!')
        console.log(`   👤 Utilisateur vérifié: ${userData.user.username}`)
      } else {
        console.log('   ❌ Erreur de vérification du token')
      }
      
    } else {
      const errorData = await response.text()
      console.log(`   ❌ Erreur de connexion: ${response.status} ${response.statusText}`)
      console.log(`   📝 Détails: ${errorData}`)
    }
    
  } catch (error) {
    console.error('\n❌ Erreur lors du test:', error.message)
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Le serveur n\'est pas démarré. Démarrez-le avec:')
      console.log('   npm run dev')
    }
  }
}

// Exécuter le test
testLogin()
