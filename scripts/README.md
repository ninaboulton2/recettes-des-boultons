# Script de Traduction Par Lot des Recettes

Ce script permet de traiter automatiquement tous les fichiers d'un dossier et de les convertir en recettes structurées dans votre application.

## Fonctionnalités

- ✅ Traitement automatique de tous les fichiers d'un dossier
- ✅ Support des formats : `.txt`, `.md`, `.doc`, `.docx`
- ✅ Traduction automatique en recettes structurées via l'API OpenAI
- ✅ Ajout automatique des recettes à votre base de données
- ✅ Logging détaillé avec sauvegarde dans un fichier
- ✅ Gestion des erreurs et reprise en cas d'échec
- ✅ Pause entre les requêtes pour éviter la surcharge de l'API

## Prérequis

1. **Serveur en cours d'exécution** : Votre application Nuxt doit être démarrée
   ```bash
   npm run dev
   ```

2. **Clé API OpenAI configurée** : Assurez-vous que `OPENAI_API_KEY` est définie dans votre fichier `.env`

3. **Dossier de fichiers** : Créez un dossier contenant vos fichiers de recettes

## Installation

1. Rendez le script exécutable :
   ```bash
   chmod +x scripts/batch-recipe-translator.js
   ```

2. Créez le dossier pour vos fichiers à traiter :
   ```bash
   mkdir recipes-to-translate
   ```

## Utilisation

### Utilisation de base

```bash
# Utiliser le dossier par défaut (./recipes-to-translate)
node scripts/batch-recipe-translator.js

# Spécifier un dossier personnalisé
node scripts/batch-recipe-translator.js /chemin/vers/votre/dossier
```

### Exemples d'utilisation

```bash
# Traiter les fichiers du dossier par défaut
node scripts/batch-recipe-translator.js

# Traiter les fichiers d'un dossier spécifique
node scripts/batch-recipe-translator.js ~/Documents/mes-recettes

# Traiter les fichiers du dossier courant
node scripts/batch-recipe-translator.js .
```

## Format des fichiers d'entrée

Le script peut traiter différents formats de fichiers :

### Fichiers texte (.txt, .md)
Contenu brut de la recette :
```
Gâteau au Chocolat

Ingrédients :
- 200g de chocolat noir
- 150g de beurre
- 4 œufs
- 100g de sucre
- 50g de farine

Préparation :
1. Faire fondre le chocolat avec le beurre
2. Battre les œufs avec le sucre
3. Mélanger le tout
4. Cuire 25 minutes à 180°C
```

### Fichiers Word (.doc, .docx)
Les fichiers Word sont automatiquement convertis en texte avant traitement.

## Configuration

Vous pouvez modifier le comportement du script en éditant `scripts/config.js` :

```javascript
module.exports = {
  // Délai entre les requêtes (en ms)
  delayBetweenRequests: 2000,
  
  // Extensions supportées
  supportedExtensions: ['.txt', '.md', '.doc', '.docx'],
  
  // URL de l'API
  api: {
    baseUrl: 'http://localhost:3000',
  }
};
```

## Logs et suivi

Le script génère des logs détaillés :

- **Console** : Affichage en temps réel du progrès
- **Fichier de log** : `batch-translation.log` avec tous les détails
- **Recettes échouées** : Sauvegardées dans `failed-recipes.json` (si activé)

### Exemple de log

```
[2024-01-15T10:30:00.000Z] [INFO] === Début du traitement par lot des recettes ===
[2024-01-15T10:30:00.000Z] [INFO] Nombre de fichiers à traiter: 3
[2024-01-15T10:30:00.000Z] [INFO] Progression: 1/3
[2024-01-15T10:30:00.000Z] [INFO] Traitement du fichier: gateau-chocolat.txt
[2024-01-15T10:30:00.000Z] [INFO] Contenu lu (245 caractères): gateau-chocolat.txt
[2024-01-15T10:30:00.000Z] [INFO] Traduction en cours: gateau-chocolat.txt
[2024-01-15T10:30:05.000Z] [INFO] Recette traduite avec succès: Gâteau au Chocolat
[2024-01-15T10:30:05.000Z] [INFO] Ajout de la recette: Gâteau au Chocolat
[2024-01-15T10:30:06.000Z] [SUCCESS] Recette ajoutée avec succès - ID: 15, Titre: Gâteau au Chocolat
```

## Gestion des erreurs

Le script gère automatiquement :

- **Fichiers vides** : Ignorés avec un avertissement
- **Erreurs de traduction** : Loggées et fichier marqué comme échoué
- **Erreurs d'API** : Pause et retry automatique
- **Fichiers corrompus** : Ignorés avec un message d'erreur

## Conseils d'utilisation

### Optimisation des performances

1. **Délai entre requêtes** : Augmentez `delayBetweenRequests` si vous rencontrez des erreurs de rate limiting
2. **Taille des fichiers** : Évitez les fichiers trop volumineux (>10KB)
3. **Nombre de fichiers** : Traitez par lots de 50-100 fichiers maximum

### Préparation des fichiers

1. **Nettoyez vos fichiers** : Supprimez les caractères spéciaux inutiles
2. **Structurez le contenu** : Assurez-vous que les ingrédients et étapes sont clairement séparés
3. **Vérifiez l'encodage** : Utilisez UTF-8 pour les caractères spéciaux

### Dépannage

**Erreur "Clé API OpenAI non configurée"**
```bash
# Vérifiez votre fichier .env
echo $OPENAI_API_KEY
```

**Erreur "Connection refused"**
```bash
# Vérifiez que votre serveur tourne
curl http://localhost:3000/api/translate-recipe
```

**Fichiers Word non lus**
```bash
# Installez pandoc pour une meilleure compatibilité
brew install pandoc
```

## Structure des recettes générées

Les recettes sont automatiquement structurées selon le format de votre application :

```json
{
  "id": "15",
  "title": "Gâteau au Chocolat",
  "description": "Un délicieux gâteau au chocolat",
  "category": "desserts et gâteaux",
  "ingredients": [
    { "name": "chocolat noir", "amount": 200, "unit": "g" },
    { "name": "beurre", "amount": 150, "unit": "g" }
  ],
  "instructions": [
    "Faire fondre le chocolat avec le beurre",
    "Battre les œufs avec le sucre"
  ],
  "prepTime": 15,
  "cookTime": 25,
  "servings": 8,
  "image": "/images/desserts et gâteaux.png",
  "tags": [],
  "favorite": false,
  "notes": ""
}
```

## Support

Si vous rencontrez des problèmes :

1. Vérifiez les logs dans `batch-translation.log`
2. Assurez-vous que votre serveur fonctionne
3. Vérifiez votre clé API OpenAI
4. Consultez la section de dépannage ci-dessus 