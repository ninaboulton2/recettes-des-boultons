# Durcissement de sécurité — procédure

Corrige les 3 points critiques de l'audit : (1) endpoints serveur sans auth, (2) RLS ouvert en écriture publique, (3) secrets exposés.

## Ce qui a été modifié dans le code

- **`server/utils/auth.ts`** (nouveau) — `requireUser` / `requireAdmin` : valident le token Supabase reçu via `Authorization: Bearer`, créent un client Supabase scopé sur ce token (le RLS s'applique avec `auth.uid()`), et dérivent l'identité du token (plus aucun `userId` de confiance venant du client).
- **24 endpoints `server/api/`** — protégés : contenu recettes = `requireAdmin`, données personnelles = `requireUser`. Les 3 GET `recipes*` restent publics (consultation sans compte).
- **`composables/useApi.ts`** (nouveau) + **4 stores** — `apiFetch` injecte automatiquement le token dans tous les appels API.
- **`supabase/migrations/0001_harden_rls.sql`** (nouveau, **non appliqué**) — durcissement RLS.
- **`credentials.json`** — retiré du suivi git + ajouté au `.gitignore`.

## Ordre de déploiement (IMPORTANT)

La migration RLS s'applique sur la base partagée avec le site live. Tant que l'ancien code tourne en prod, l'appliquer **casse** le site. Donc :

1. **Vérifier en local** : `npm run dev`, se connecter en admin, tester ajout/modif/suppression d'une recette + courses/planning/favoris. (Le build de prod passe déjà : `npm run build` ✅.)
2. **Basculer la clé** : mettre la clé publishable (`sb_publishable_…`) comme valeur de `SUPABASE_ANON_KEY` dans Vercel **et** `.env`. (Compatible ancien et nouveau code, aucune coupure.)
3. **Déployer** le nouveau code : commit + `git push origin main` (Vercel redéploie automatiquement).
4. **Vérifier la prod** avec le nouveau code déployé.
5. **Appliquer la migration RLS** `supabase/migrations/0001_harden_rls.sql` (via le SQL Editor du dashboard Supabase, ou je peux l'appliquer via l'outil MCP une fois que tu confirmes que le déploiement est en ligne).
6. **Re-tester la prod** : admin + un compte utilisateur normal.
7. **Désactiver les clés legacy** (Supabase → Settings → API → « Disable JWT-based API keys ») → neutralise la clé `service_role` exposée.
8. Relancer l'advisor de sécurité Supabase — les 19 « RLS Policy Always True » doivent disparaître.

## Checklist de rotation des secrets (à faire absolument)

Ces secrets ont été exposés (dans `credentials.json` et `env.example` suivis par git, et/ou en clair dans le doc Obsidian). **Les considérer comme compromis** et les régénérer :

- [x] 🔴 **Neutraliser la clé `service_role` legacy** — exposée dans `env.example` (tracké/poussé sur GitHub), elle **contourne tout le RLS**. Non utilisée par le code. Nouvelles clés Supabase déjà créées ✅. Procédure (sans « Roll JWT secret », donc **sans déconnecter les utilisateurs**) :
   1. Copier la **clé publishable** (`sb_publishable_…`) → la mettre comme valeur de `SUPABASE_ANON_KEY` dans `.env` (local) **et** dans Vercel. supabase-js 2.56 l'accepte en remplacement direct de l'anon — **aucun changement de code**.
   2. [ ] To do : Déployer le nouveau code (cf. ordre ci-dessus) et vérifier que tout marche.
   3. Supabase → Settings → API → onglet **« Legacy anon, service_role API keys »** → **« Disable JWT-based API keys »**. Ceci invalide définitivement les clés legacy `anon` ET `service_role` (donc celle qui a fuité).
   - ℹ️ La nouvelle **clé secret** (`sb_secret_…`) n'est **pas utilisée** par l'app (architecture = token utilisateur + RLS). La garder en lieu sûr, ou la supprimer si inutilisée. Ne jamais la mettre côté client.
- [x] **Clé OpenAI** (`OPENAI_API_KEY`) — révoquer l'ancienne sur platform.openai.com, en créer une nouvelle, la mettre à jour dans les variables d'environnement Vercel + `.env` local.
- [x] **Secret OAuth Google** (`client_secret` de `credentials.json`) — supprimé2
- [x] **`JWT_SECRET`** — supprimée
- [x] **`ADMIN_PASSWORD` / `ADMIN_USERNAME`** — supprimées
- [x] **Clé `anon` legacy** — disabled
- [ ] **Mettre à jour le doc Obsidian** — retirer les secrets en clair, mettre des placeholders.

> ⚠️ Note : retirer `credentials.json` du suivi ne l'efface pas de l'historique git (commit `cbfca2e`). La rotation des secrets ci-dessus est donc indispensable. Si le dépôt GitHub est **public**, c'est d'autant plus urgent — vérifier la visibilité du repo.

## Limites résiduelles connues

- Les 4 fonctions RPC favoris (`add_user_favorite`, etc.) restent exécutables par les utilisateurs authentifiés et prennent un `user_id` en paramètre. Le serveur ne passe que l'identité du token, donc pas d'exposition via l'app ; un durcissement complet (réécrire ces fonctions pour utiliser `auth.uid()` en interne) est recommandé dans une passe ultérieure. Les ~11 fonctions inutilisées sont entièrement neutralisées par la migration.
- La clé `service_role` reste dans l'historique git tant que les clés legacy ne sont pas désactivées (étape 🔴) — c'est l'action qui la neutralise réellement.
