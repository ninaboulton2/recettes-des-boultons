# Configuration Supabase pour Recettes des Boultons

## Étape 1 : Créer un projet Supabase

1. Allez sur [supabase.com](https://supabase.com)
2. Créez un compte ou connectez-vous
3. Créez un nouveau projet
4. Notez votre URL de projet et votre clé anonyme

## Étape 2 : Configurer la base de données

1. Dans votre projet Supabase, allez dans l'éditeur SQL
2. Copiez et exécutez le contenu du fichier `supabase-setup.sql`
3. Cela créera la table `recipes` avec tous les index nécessaires

## Étape 3 : Configurer les variables d'environnement

### En local (développement)
Créez un fichier `.env` à la racine du projet :

```bash
SUPABASE_URL=https://votre-projet.supabase.co
SUPABASE_API_KEY=votre_cle_anonyme
```

### Sur Vercel (production)
1. Allez dans votre projet Vercel
2. Section "Settings" > "Environment Variables"
3. Ajoutez :
   - `SUPABASE_URL` = votre URL Supabase
   - `SUPABASE_API_KEY` = votre clé anonyme

## Étape 4 : Vérifier la configuration

1. Redémarrez votre serveur de développement
2. Testez l'API `/api/add-recipe`
3. Vérifiez dans Supabase que les recettes sont bien ajoutées

## Structure de la base de données

La table `recipes` contient :
- `id` : UUID unique (généré automatiquement)
- `title` : Titre de la recette
- `description` : Description
- `category` : Catégorie (soupes, plats, desserts, etc.)
- `ingredients` : JSON des ingrédients
- `instructions` : JSON des étapes
- `prep_time` : Temps de préparation en minutes
- `cook_time` : Temps de cuisson en minutes
- `servings` : Nombre de portions
- `image` : Chemin de l'image
- `tags` : Tableau de tags (végétarien, vegan, etc.)
- `favorite` : Boolean pour les favoris
- `notes` : Notes additionnelles
- `created_at` : Date de création
- `updated_at` : Date de mise à jour

## Sécurité

- Row Level Security (RLS) est activé
- Les politiques permettent la lecture/écriture publique (à ajuster selon vos besoins)
- Utilisez des clés d'API avec les bonnes permissions

## Migration des données existantes

Les recettes existantes ont été migrées vers Supabase. Le fichier `public/data/recipes.json` a été supprimé car il n'est plus nécessaire.
