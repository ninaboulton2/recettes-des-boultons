// Script pour vider le localStorage des recettes
if (typeof window !== 'undefined') {
  localStorage.removeItem('boultons-recipes')
  localStorage.removeItem('boultons-favorites')
  console.log('localStorage des recettes vidé avec succès')
  console.log('Rechargez la page pour recharger les recettes depuis le fichier JSON')
} else {
  console.log('Ce script doit être exécuté dans le navigateur')
}
