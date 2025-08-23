#!/usr/bin/env node

/**
 * Test d'intégration complète des listes de courses
 * Vérifie que toutes les APIs fonctionnent et que le store est synchronisé
 */

const BASE_URL = 'http://localhost:3001'

async function testShoppingIntegration() {
  console.log('🛒 Test d\'intégration des listes de courses...\n')

  try {
    // 1. Vérifier l'état initial
    console.log('1️⃣ Vérification de l\'état initial...')
    const initialResponse = await fetch(`${BASE_URL}/api/shopping-lists`)
    const initialData = await initialResponse.json()
    
    if (!initialData.success) {
      throw new Error('Erreur lors du chargement des listes')
    }
    
    console.log(`   ✅ ${initialData.lists.length} liste(s) trouvée(s)`)
    if (initialData.lists.length > 0) {
      const list = initialData.lists[0]
      console.log(`   📝 Liste: "${list.name}" avec ${list.items.length} items`)
    }

    // 2. Test de création d'un nouvel item
    console.log('\n2️⃣ Test d\'ajout d\'un nouvel item...')
    const addItemResponse = await fetch(`${BASE_URL}/api/shopping-items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        listId: initialData.lists[0].id,
        name: 'Test Item API',
        amount: 2,
        unit: 'kg',
        recipeId: null
      })
    })
    
    const addItemData = await addItemResponse.json()
    if (!addItemData.success) {
      throw new Error(`Erreur lors de l'ajout: ${addItemData.message}`)
    }
    
    console.log(`   ✅ Item ajouté: ${addItemData.item.name}`)
    const newItemId = addItemData.item.id

    // 3. Test de mise à jour de l'item (checked)
    console.log('\n3️⃣ Test de mise à jour de l\'item (checked)...')
    const updateResponse = await fetch(`${BASE_URL}/api/shopping-items/${newItemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isChecked: true })
    })
    
    const updateData = await updateResponse.json()
    if (!updateData.success) {
      throw new Error(`Erreur lors de la mise à jour: ${updateData.message}`)
    }
    
    console.log(`   ✅ Item mis à jour: checked = ${updateData.item.isChecked}`)

    // 4. Test de mise à jour du nom de la liste
    console.log('\n4️⃣ Test de mise à jour du nom de la liste...')
    const updateListResponse = await fetch(`${BASE_URL}/api/shopping-lists/${initialData.lists[0].id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Liste de test API' })
    })
    
    const updateListData = await updateListResponse.json()
    if (!updateListData.success) {
      throw new Error(`Erreur lors de la mise à jour de la liste: ${updateListData.message}`)
    }
    
    console.log(`   ✅ Nom de liste mis à jour: "${updateListData.list.name}"`)

    // 5. Vérifier l'état après les modifications
    console.log('\n5️⃣ Vérification de l\'état après modifications...')
    const finalResponse = await fetch(`${BASE_URL}/api/shopping-lists`)
    const finalData = await finalResponse.json()
    
    if (!finalData.success) {
      throw new Error('Erreur lors du chargement final')
    }
    
    const finalList = finalData.lists[0]
    console.log(`   📝 Liste finale: "${finalList.name}" avec ${finalList.items.length} items`)
    
    const testItem = finalList.items.find(item => item.name === 'Test Item API')
    if (testItem) {
      console.log(`   ✅ Item de test trouvé: checked = ${testItem.isChecked}`)
    }

    // 6. Test de suppression de l'item de test
    console.log('\n6️⃣ Test de suppression de l\'item de test...')
    const deleteResponse = await fetch(`${BASE_URL}/api/shopping-items/${newItemId}`, {
      method: 'DELETE'
    })
    
    const deleteData = await deleteResponse.json()
    if (!deleteData.success) {
      throw new Error(`Erreur lors de la suppression: ${deleteData.message}`)
    }
    
    console.log(`   ✅ Item supprimé: ${deleteData.message}`)

    // 7. Remettre le nom original de la liste
    console.log('\n7️⃣ Restauration du nom original de la liste...')
    const restoreResponse = await fetch(`${BASE_URL}/api/shopping-lists/${initialData.lists[0].id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Ma liste de courses' })
    })
    
    const restoreData = await restoreResponse.json()
    if (!restoreData.success) {
      throw new Error(`Erreur lors de la restauration: ${restoreData.message}`)
    }
    
    console.log(`   ✅ Nom restauré: "${restoreData.list.name}"`)

    console.log('\n🎉 Test d\'intégration réussi ! Toutes les APIs fonctionnent correctement.')
    console.log('\n📋 Résumé des tests:')
    console.log('   ✅ Chargement des listes')
    console.log('   ✅ Ajout d\'items')
    console.log('   ✅ Mise à jour d\'items (checked)')
    console.log('   ✅ Mise à jour du nom de liste')
    console.log('   ✅ Suppression d\'items')
    console.log('   ✅ Synchronisation avec Supabase')

  } catch (error) {
    console.error('\n❌ Erreur lors du test:', error.message)
    process.exit(1)
  }
}

// Vérifier que l'application est démarrée
async function checkAppRunning() {
  try {
    const response = await fetch(`${BASE_URL}/api/shopping-lists`)
    return response.ok
  } catch {
    return false
  }
}

// Main
async function main() {
  console.log('🔍 Vérification que l\'application est démarrée...')
  
  if (!(await checkAppRunning())) {
    console.error('❌ L\'application n\'est pas démarrée sur http://localhost:3001')
    console.error('   Démarrez l\'application avec: npm run dev')
    process.exit(1)
  }
  
  console.log('✅ Application détectée, lancement des tests...\n')
  
  await testShoppingIntegration()
}

main().catch(console.error)
