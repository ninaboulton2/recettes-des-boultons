# Recettes des Boultons

Le carnet de recettes de la famille Boulton, en ligne : on y range les recettes, on prépare
le planning des repas de la semaine et on fait les courses à partir de ce planning.

Site : https://recettes-des-boultons.vercel.app

## Fonctionnalités

- **Recettes organisées en sections** (« Pâte », « Garniture »…), chacune avec ses
  ingrédients et ses étapes. Ajout, modification et suppression réservés aux administrateurs.
- **Recherche sans accents** : « gateau » trouve « Gâteau au yaourt ». Filtres par catégorie
  et par tags, pagination.
- **Portions ajustables** : les quantités se recalculent selon le nombre de personnes.
- **Mode cuisine** : une étape à la fois, en plein écran, l'écran reste allumé.
- **Photos** : une photo par recette, redimensionnée dans le navigateur avant l'envoi.
- **Favoris**.
- **Planning des repas** : déjeuner et dîner sur la semaine, recettes ou repas libres, notes,
  déplacement par glisser-déposer (ou par un menu « Déplacer… »), impression.
- **Listes de courses** : ajout des ingrédients d'une recette (toutes les sections ou
  certaines), quantités additionnées quand un article revient avec la même unité, tri par
  rayon, mode « magasin » avec de grandes cases à cocher.
- **Hors ligne** : la dernière version des listes de courses reste lisible sans réseau.
- **Traducteur IA** (administrateurs) : une recette collée en texte libre devient une
  recette structurée, relue avant l'ajout.
- **Connexion** par e-mail et mot de passe, ou avec Google.
- **Français et anglais**, **mode sombre**, **installable** sur téléphone (PWA).

## Stack

| | |
|---|---|
| Application | Nuxt 4.5 (Vue 3.5, rendu serveur), Nuxt UI 4.11 (Tailwind CSS 4.3), Pinia 3, @nuxtjs/i18n 10 |
| Données et comptes | Supabase (PostgreSQL 17, Auth, Storage) via @nuxtjs/supabase 2 et supabase-js 2.117 |
| Validation | Zod 3.25, partagé entre le navigateur et le serveur |
| IA | Vercel AI SDK 7 (OpenAI `gpt-4.1-mini` par défaut) |
| Qualité | TypeScript strict, ESLint 9, Vitest 5, Playwright 1.63, GitHub Actions |
| Suivi des erreurs | Sentry (@sentry/nuxt 11), inactif sans DSN |
| Hébergement | Vercel, Node 22 |

## Démarrage rapide (base locale)

Prérequis : Node 22 (`.nvmrc`), Docker Desktop, `psql` (`brew install libpq`).

```bash
npm install
npm run db:local:up                  # Supabase local (Docker) + migrations + comptes de test
cp .env.local.example .env.local
npm run dev:local                    # http://localhost:3001
```

Comptes de test (mot de passe `password123`) : `admin@local.test` (administrateur) et
`user@local.test`. Studio Supabase : http://127.0.0.1:54323.

Les recettes réelles viennent d'un export des données de la famille, qui n'est pas dans le
dépôt. Sans lui, la base locale démarre vide ; pour avoir des recettes de test, voir
« Données locales » dans [DEVELOPER.md](DEVELOPER.md).

> Ne lancez jamais `npm run dev` avec un fichier `.env` qui pointe sur la base de
> production : utilisez `npm run dev:local`.

Vérifications courantes : `npm run lint`, `npm run typecheck`, `npm test`,
`npm run test:e2e` (base locale).

## Documentation

- [DEVELOPER.md](DEVELOPER.md) : guide technique (architecture, base de données, API,
  tests, variables d'environnement).
- [supabase/BASCULE_PROD.md](supabase/BASCULE_PROD.md) : mise en production des migrations
  0003 → 0015, pas à pas.
- [docs/IA_MODELES.md](docs/IA_MODELES.md) : comparatif des modèles pour le traducteur.
- [SECURITY_HARDENING.md](SECURITY_HARDENING.md) : état de la sécurité et actions restantes.
- [supabase/local/README.md](supabase/local/README.md) : base de développement locale.
