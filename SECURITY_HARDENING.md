# Sécurité — état et actions restantes

Mis à jour le 2026-10-04 (branche `modernisation`). Point de départ : l'audit qui relevait
(1) des endpoints serveur sans authentification, (2) un RLS ouvert en écriture publique,
(3) des secrets exposés dans le dépôt.

## 1. État actuel

### Base de données

- **RLS sur toutes les tables**, posé par les migrations `0001` → `0015` :
  - `0001` : lecture publique des recettes, écriture réservée aux admins ; données
    personnelles (favoris, planning, notes, listes, articles) réservées à leur propriétaire ;
    trigger `prevent_role_change` contre l'auto-promotion.
  - `0002` : suppression des 4 RPC favoris en `SECURITY DEFINER` (elles prenaient un
    `user_id` en paramètre) et de 11 fonctions inutilisées.
  - `0009` : `public.is_admin()` remplacée par **`private.is_admin()`** (schéma non exposé
    par l'API), qui lit le claim JWT `user_role` et retombe sur `profiles.role` sans claim.
    Les 14 politiques concernées sont recréées à l'identique sur la nouvelle fonction.
  - `0010` : bucket `recipe-photos` en lecture publique, écriture admin.
  - `0012` : `ai_usage` lisible par son propriétaire (ou un admin), insertion de ses propres
    lignes seulement.
  - Tables de sauvegarde (`*_backup_*`, `*_orphans_*`) : RLS sans politique, droits révoqués.
- Les nouvelles fonctions (`save_recipe`, `merge_shopping_item`, `search_recipes`…) sont en
  `SECURITY INVOKER` : le RLS s'applique. `search_path` figé partout.
- En production, `0001` et `0002` sont appliquées ; `0003` → `0015` le seront pendant la
  bascule ([supabase/BASCULE_PROD.md](supabase/BASCULE_PROD.md)).

### Serveur

- Tous les endpoints d'écriture appellent `requireUser` ou `requireAdmin`
  (`server/utils/auth.ts`). L'identité vient du token validé (cookie de session ou
  `Authorization: Bearer`), jamais d'un `userId` fourni par le client.
- Il n'y a plus d'endpoint de lecture : les lectures passent par le client Supabase sous RLS.
- **Validation Zod partout** : corps, query et paramètres de route (`server/utils/validate.ts`,
  schémas `shared/schemas/`). Entrée invalide → 400.
- **Erreurs masquées** : `handleApiError` et `throwSupabaseError` (`server/utils/errors.ts`)
  ne renvoient que des messages prévus ; toute autre erreur devient un 500 générique, le
  détail reste dans les journaux serveur.
- **Quota IA** : `AI_DAILY_QUOTA` appels par personne et par jour (défaut 50), contrôlé par
  `check_ai_quota` et journalisé dans `ai_usage`. Le traducteur reste réservé aux admins.
- La clé `service_role` / `sb_secret_…` n'est pas utilisée par l'application.

### Client et observabilité

- La garde de route admin (`app/middleware/auth.ts`) ne sert qu'à l'affichage.
- **Sentry sans données personnelles** : ni utilisateur, ni cookies, ni en-têtes, ni corps,
  ni paramètres d'URL, ni variables locales ; pas de Session Replay. Inactif sans DSN.
- Le service worker ne met en cache ni Supabase ni `/api/**` ; le cache des pages et la copie
  hors ligne des courses sont effacés à la déconnexion.

### Secrets

| Secret | État |
|---|---|
| `credentials.json` | retiré du suivi Git et ajouté au `.gitignore` ; il reste dans l'historique (commit `cbfca2e`) |
| Clé OpenAI | révoquée et remplacée |
| Secret OAuth Google de `credentials.json` | supprimé |
| `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` | supprimés |
| Nouvelles clés Supabase (`sb_publishable_…`, `sb_secret_…`) | créées |
| Clés legacy `anon` / `service_role` (la `service_role` a fuité via `env.example`) | **rotation à finaliser** : désactivation pas encore faite |

## 2. Actions restantes

Dans l'ordre :

1. **Bascule des migrations** `0003` → `0015` selon
   [supabase/BASCULE_PROD.md](supabase/BASCULE_PROD.md).
2. **Activer le hook JWT après 0009** : Authentication → Hooks → *Customize Access Token
   (JWT) Claims* → type Postgres, schéma `public`, fonction `custom_access_token_hook`. Le
   hook n'est proposé qu'une fois 0009 appliquée. En cas de problème, le désactiver : les
   droits retombent sur `profiles.role`.
3. **Expiration des OTP e-mail < 1 h** : Authentication → Providers → Email → *Email OTP
   Expiration* (ex. 1800 s).
4. **Protection contre les mots de passe divulgués** (HaveIBeenPwned) : Authentication →
   Providers → Email, ou Settings → Password security.
5. **Patch Postgres** (`vulnerable_postgres_version`, prod en `17.4.1.074`) : Settings →
   Infrastructure → Upgrade, après une sauvegarde ; courte indisponibilité.
6. **Désactiver les clés legacy** : vérifier d'abord que `SUPABASE_ANON_KEY` vaut la clé
   publishable (`sb_publishable_…`) dans Vercel et dans `.env.local`, puis Settings → API
   Keys → *Disable JWT-based API keys*. Cela invalide la `service_role` qui a fuité. Ne pas
   utiliser « Roll JWT secret » (déconnecterait tout le monde).
7. **Relancer le Security Advisor** (dashboard ou outil MCP `get_advisors`) : l'alerte sur
   `is_admin` doit avoir disparu. Les tables `*_20261003` signalées « RLS sans politique »
   sont voulues jusqu'à 0014.
8. Retirer les secrets en clair de la note Obsidian du projet.
9. Vérifier la visibilité du dépôt GitHub : s'il est public, l'étape 6 est urgente.

## 3. Limites connues

- Le contrôle admin côté client et le middleware ne protègent rien : seuls le serveur et le
  RLS font foi (c'est voulu).
- Avant activation du hook, le rôle admin est lu dans `profiles.role` à chaque contrôle.
  Après activation, un changement de rôle ne prend effet qu'à la reconnexion.
- Le quota IA laisse passer l'appel si `check_ai_quota` est indisponible (garde-fou de coût,
  pas de sécurité).
- Les erreurs 500 arrivent dans Sentry sous un message générique (voir DEVELOPER.md § 12).
