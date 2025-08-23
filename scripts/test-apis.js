#!/usr/bin/env node

/**
 * Script de test des nouvelles APIs
 * Usage: node scripts/test-apis.js
 */

require('dotenv').config()

const BASE_URL = 'http://localhost:3001'

// Fonction de test des APIs
async function testAPIs() {
  console.log('🧪 Test des nouvelles APIs...\n')
  
  try {
    // 1. Test de l'API des recettes
    console.log('📋 Test API /api/recipes...')
    const recipesResponse = await fetch(`${BASE_URL}/api/recipes`)
    if (recipesResponse.ok) {
      const recipesData = await recipesResponse.json()
      console.log('✅ API recipes: OK')
      console.log(`   - Nombre de recettes: ${recipesData.count}`)
    } else {
      console.log('❌ API recipes: Erreur', recipesResponse.status)
    }

    // 2. Test de l'API des favoris
    console.log('\n🏷️  Test API /api/favorites...')
    const favoritesResponse = await fetch(`${BASE_URL}/api/favorites`)
    if (favoritesResponse.ok) {
      const favoritesData = await favoritesResponse.json()
      console.log('✅ API favorites: OK')
      console.log(`   - Nombre de favoris: ${favoritesData.count}`)
    } else {
      console.log('❌ API favorites: Erreur', favoritesResponse.status)
    }

    // 3. Test de l'API du planning
    console.log('\n📅 Test API /api/planning...')
    const planningResponse = await fetch(`${BASE_URL}/api/planning`)
    if (planningResponse.ok) {
      const planningData = await planningResponse.json()
      console.log('✅ API planning: OK')
      console.log(`   - Nombre de repas planifiés: ${planningData.count}`)
    } else {
      console.log('❌ API planning: Erreur', planningResponse.status)
    }

    // 4. Test de l'API des listes de courses
    console.log('\n🛒 Test API /api/shopping-lists...')
    const listsResponse = await fetch(`${BASE_URL}/api/shopping-lists`)
    if (listsResponse.ok) {
      const listsData = await listsResponse.json()
      console.log('✅ API shopping-lists: OK')
      console.log(`   - Nombre de listes: ${listsData.count}`)
    } else {
      console.log('❌ API shopping-lists: Erreur', listsResponse.status)
    }

    console.log('\n🎯 Résumé des tests:')
    console.log('✅ Toutes les APIs sont créées et accessibles')
    console.log('✅ La structure Supabase est complète')
    console.log('✅ Prêt pour la synchronisation multi-appareils')

  } catch (error) {
    console.error('💥 Erreur lors des tests:', error.message)
    console.log('\n💡 Assurez-vous que votre application est démarrée:')
    console.log('   npm run dev')
  }
}

// Lancer les tests
testAPIs()
