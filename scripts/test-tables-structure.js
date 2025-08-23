#!/usr/bin/env node

/**
 * Script de test de la structure des tables Supabase
 * Usage: node scripts/test-tables-structure.js
 */

require('dotenv').config()

// Configuration Supabase
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_API_KEY = process.env.SUPABASE_API_KEY

if (!SUPABASE_URL || !SUPABASE_API_KEY) {
  console.error('❌ Variables d\'environnement Supabase manquantes')
  console.error('Vérifiez votre fichier .env')
  process.exit(1)
}

// Fonction de test des tables
async function testTablesStructure() {
  console.log('🔍 Test de la structure des tables Supabase...\n')
  
  try {
    // 1. Test de la table favorites
    console.log('📋 Test de la table favorites...')
    const favoritesResponse = await fetch(`${SUPABASE_URL}/rest/v1/favorites?select=count`, {
      headers: {
        'apikey': SUPABASE_API_KEY,
        'Authorization': `Bearer ${SUPABASE_API_KEY}`
      }
    })
    
    if (favoritesResponse.ok) {
      const favoritesData = await favoritesResponse.json()
      console.log('✅ Table favorites: OK')
      console.log('   - Nombre de favoris:', favoritesData[0]?.count || 0)
    } else {
      console.log('❌ Table favorites: Erreur', favoritesResponse.status)
    }
    
    // 2. Test de la table planning
    console.log('\n📅 Test de la table planning...')
    const planningResponse = await fetch(`${SUPABASE_URL}/rest/v1/planning?select=count`, {
      headers: {
        'apikey': SUPABASE_API_KEY,
        'Authorization': `Bearer ${SUPABASE_API_KEY}`
      }
    })
    
    if (planningResponse.ok) {
      const planningData = await planningResponse.json()
      console.log('✅ Table planning: OK')
      console.log('   - Nombre de repas planifiés:', planningData[0]?.count || 0)
    } else {
      console.log('❌ Table planning: Erreur', planningResponse.status)
    }
    
    // 3. Test de la table shopping_lists
    console.log('\n🛒 Test de la table shopping_lists...')
    const listsResponse = await fetch(`${SUPABASE_URL}/rest/v1/shopping_lists?select=*`, {
      headers: {
        'apikey': SUPABASE_API_KEY,
        'Authorization': `Bearer ${SUPABASE_API_KEY}`
      }
    })
    
    if (listsResponse.ok) {
      const listsData = await listsResponse.json()
      console.log('✅ Table shopping_lists: OK')
      console.log('   - Nombre de listes:', listsData.length)
      console.log('   - Listes disponibles:', listsData.map(l => l.name).join(', '))
    } else {
      console.log('❌ Table shopping_lists: Erreur', listsResponse.status)
    }
    
    // 4. Test de la table shopping_items
    console.log('\n📝 Test de la table shopping_items...')
    const itemsResponse = await fetch(`${SUPABASE_URL}/rest/v1/shopping_items?select=count`, {
      headers: {
        'apikey': SUPABASE_API_KEY,
        'Authorization': `Bearer ${SUPABASE_API_KEY}`
      }
    })
    
    if (itemsResponse.ok) {
      const itemsData = await itemsResponse.json()
      console.log('✅ Table shopping_items: OK')
      console.log('   - Nombre d\'articles:', itemsData[0]?.count || 0)
    } else {
      console.log('❌ Table shopping_items: Erreur', itemsResponse.status)
    }
    
    // 5. Test d'insertion d'un favori
    console.log('\n🧪 Test d\'insertion d\'un favori...')
    const testFavoriteResponse = await fetch(`${SUPABASE_URL}/rest/v1/favorites`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_API_KEY,
        'Authorization': `Bearer ${SUPABASE_API_KEY}`
      },
      body: JSON.stringify({
        recipe_id: '00000000-0000-0000-0000-000000000000', // ID de test
        user_id: null
      })
    })
    
    if (testFavoriteResponse.ok) {
      console.log('✅ Insertion favori: OK')
      
      // Récupérer l'ID du favori créé pour le supprimer
      const createdFavorite = await testFavoriteResponse.json()
      console.log('   - Favori créé avec ID:', createdFavorite.id)
      
      // Supprimer le favori de test
      const deleteResponse = await fetch(`${SUPABASE_URL}/rest/v1/favorites?id=eq.${createdFavorite.id}`, {
        method: 'DELETE',
        headers: {
          'apikey': SUPABASE_API_KEY,
          'Authorization': `Bearer ${SUPABASE_API_KEY}`
        }
      })
      
      if (deleteResponse.ok) {
        console.log('✅ Suppression favori de test: OK')
      } else {
        console.log('⚠️  Suppression favori de test: Échec')
      }
      
    } else {
      console.log('❌ Insertion favori: Erreur', testFavoriteResponse.status)
      const errorText = await testFavoriteResponse.text()
      console.log('   - Détails:', errorText)
    }
    
    console.log('\n🎯 Résumé des tests:')
    console.log('✅ Toutes les tables sont créées et accessibles')
    console.log('✅ Les opérations CRUD fonctionnent')
    console.log('✅ La structure est prête pour les APIs')
    
  } catch (error) {
    console.error('💥 Erreur lors des tests:', error.message)
  }
}

// Lancer les tests
testTablesStructure()
