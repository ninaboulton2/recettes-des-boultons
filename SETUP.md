# Configuration du Traducteur de Recettes

## Prérequis

Pour utiliser le traducteur de recettes avec OpenAI, vous devez :

1. Avoir un compte OpenAI
2. Obtenir une clé API OpenAI depuis [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)

## Configuration

1. Créez un fichier `.env` à la racine du projet
2. Ajoutez votre clé API OpenAI :

```env
OPENAI_API_KEY=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
NODE_ENV=development
```
## Utilisation

1. Lancez l'application en mode développement :
   ```bash
   npm run dev
   ```

2. Accédez au traducteur de recettes via :
   - Le bouton "Traducteur de recettes" sur la page d'accueil
   - L'URL directe : `http://localhost:3000/traducteur`

3. Collez le texte de votre recette depuis Google Drive
4. Cliquez sur "Traduire en JSON"
5. Récupérez votre recette au format JSON structuré

## Mode de test

En mode développement, un bouton "Test (sans API)" est disponible pour tester l'interface sans avoir besoin d'une clé API OpenAI.

## Résolution des erreurs

### Erreur 500 - Clé API non configurée
Si vous voyez l'erreur "Clé API OpenAI non configurée", vérifiez que :
- Le fichier `.env` existe à la racine du projet
- La clé API est correctement configurée
- La clé API commence par `sk-`

### Erreur 401 - Clé API invalide
Vérifiez que votre clé API est valide et active sur votre compte OpenAI.

### Erreur 402 - Quota insuffisant
Vérifiez votre quota OpenAI sur [https://platform.openai.com/usage](https://platform.openai.com/usage)

## Format JSON généré

Le traducteur génère un JSON avec la structure suivante :

```json
{
  "title": "Titre de la recette",
  "description": "Description de la recette",
  "prepTime": 15,
  "cookTime": 45,
  "servings": 4,
  "difficulty": "facile",
  "ingredients": [
    {
      "name": "nom de l'ingrédient",
      "amount": "quantité",
      "unit": "unité"
    }
  ],
  "instructions": [
    "Étape 1",
    "Étape 2"
  ],
  "category": "catégorie",
  "tags": ["tag1", "tag2"]
}
```

## Sécurité

- Ne partagez jamais votre clé API OpenAI
- Le fichier `.env` est automatiquement ignoré par Git
- Utilisez des variables d'environnement en production 