module.exports = {
  // Configuration du script de traduction par lot
  
  // Dossier par défaut contenant les fichiers à traiter
  defaultInputFolder: './recipes-to-translate',
  
  // Extensions de fichiers supportées
  supportedExtensions: ['.txt', '.md', '.doc', '.docx', '.pdf'],
  
  // Délai entre les requêtes (en millisecondes)
  // Augmentez cette valeur si vous rencontrez des erreurs de rate limiting
  delayBetweenRequests: 2000,
  
  // Fichier de log
  logFile: './batch-translation.log',
  
  // Configuration de l'API
  api: {
    // URL de base de l'API (modifiez si votre serveur tourne sur un autre port)
    baseUrl: 'http://localhost:3000',
    
    // Timeout pour les requêtes API (en millisecondes)
    timeout: 30000,
  },
  
  // Configuration pour les fichiers Word
  wordProcessing: {
    // Utiliser textutil sur macOS (par défaut) ou pandoc si disponible
    usePandoc: false,
    
    // Commande alternative pour convertir les fichiers Word
    // Exemple: 'pandoc -f docx -t plain'
    pandocCommand: 'pandoc -f docx -t plain',
  },
  
  // Configuration de validation
  validation: {
    // Taille minimale du contenu (en caractères)
    minContentLength: 50,
    
    // Taille maximale du contenu (en caractères)
    maxContentLength: 10000,
  },
  
  // Configuration des logs
  logging: {
    // Niveau de détail des logs (DEBUG, INFO, WARNING, ERROR)
    level: 'INFO',
    
    // Afficher les détails de chaque recette traduite
    showRecipeDetails: false,
    
    // Sauvegarder les recettes échouées dans un fichier séparé
    saveFailedRecipes: true,
    failedRecipesFile: './failed-recipes.json',
  }
}; 