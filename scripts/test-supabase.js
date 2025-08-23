#!/usr/bin/env node

/**
 * Script de test de connexion à Supabase
 * Usage: node scripts/test-supabase.js
 */

require('dotenv').config()

// Configuration Supabase
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_API_KEY = process.env.SUPABASE_API_KEY

console.log('🔍 Test de connexion à Supabase...\n')

if (!SUPABASE_URL || !SUPABASE_API_KEY) {
  console.error('❌ Variables d\'environnement manquantes:')
  console.error('SUPABASE_URL:', SUPABASE_URL ? '✅ Défini' : '❌ Manquant')
  console.error('SUPABASE_API_KEY:', SUPABASE_API_KEY ? '✅ Défini' : '❌ Manquant')
  process.exit(1)
}

console.log('✅ Variables d\'environnement trouvées')
console.log('URL:', SUPABASE_URL)
console.log('API Key:', SUPABASE_API_KEY.substring(0, 20) + '...')

// Test de connexion
async function testConnection() {
  try {
    console.log('\n🔄 Test de connexion...')
    
    const response = await fetch(`${SUPABASE_URL}/rest/v1/recipes?select=count`, {
      headers: {
        'apikey': SUPABASE_API_KEY,
        'Authorization': `Bearer ${SUPABASE_API_KEY}`
      }
    })
    
    if (response.ok) {
      const data = await response.json()
      console.log('✅ Connexion réussie !')
      console.log('📊 Nombre de recettes dans la table:', data[0]?.count || 0)
    } else {
      console.error('❌ Erreur de connexion:', response.status, response.statusText)
      const errorText = await response.text()
      console.error('Détails:', errorText)
    }
    
  } catch (error) {
    console.error('💥 Erreur de connexion:', error.message)
  }
}

testConnection()
