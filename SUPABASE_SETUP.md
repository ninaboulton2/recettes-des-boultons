# Créer un projet Supabase de zéro

Pour monter un **nouveau** projet Supabase vide (copie de test, reprise après incident…).
Pour le projet de production existant, ne pas suivre ce document : voir
[supabase/BASCULE_PROD.md](supabase/BASCULE_PROD.md). Pour développer, utiliser la base
locale : [supabase/local/README.md](supabase/local/README.md) (`npm run db:local:up`).

Le schéma n'existe pas en un seul fichier : il se reconstruit en rejouant, dans l'ordre, le
schéma d'origine puis les migrations. C'est exactement ce que fait
`supabase/local/setup.sh` sur la base locale ; le plus sûr est de tester l'enchaînement en
local avant de le jouer sur un projet hébergé.

## 1. Créer le projet

1. supabase.com → **New project** (Postgres 17, région UE).
2. Noter l'URL du projet (`https://<ref>.supabase.co`) et la clé publishable
   (`sb_publishable_…`) : Project Settings → API Keys.
3. Ne jamais mettre la clé secrète (`sb_secret_…`) dans l'application.

## 2. Construire le schéma

Exécuter chaque fichier en entier, un par un, dans cet ordre : outil MCP
`apply_migration` (un appel par fichier, `name` = nom du fichier sans extension), ou
SQL Editor (un fichier = un Run). Chaque migration est transactionnelle : en cas
d'erreur, rien n'est appliqué pour ce fichier.

| Ordre | Fichier | Contenu |
|---|---|---|
| 1 | `supabase/tests/01_baseline_schema.sql` | tables d'origine (`profiles`, `recipes`, sections, ingrédients, étapes, favoris, planning, courses), triggers `handle_new_user` et `updated_at`. **Seulement sur un projet vide**, jamais sur la prod |
| 2 | `supabase/migrations/0001_harden_rls.sql` | RLS |
| 3 | `supabase/migrations/0002_drop_unused_secdef_functions.sql` | suppression des fonctions `SECURITY DEFINER` |
| 4 | `0003_units.sql` → `0013_contract_jsonb.sql` | unités, quantités, sections, RPC, recherche, `private.is_admin()` + hook, photos, `ai_usage`, suppression du JSONB |
| 5 | `0014_drop_backups.sql` | supprime les tables de sauvegarde créées par 0005 |
| — | `0015_data_cleanup.sql` | inutile sur un projet vide (corrections de lignes précises de la prod) |

Ensuite : `notify pgrst, 'reload schema';`.

Si `0010` échoue avec « must be owner of table objects » : créer les 4 politiques du bucket
dans Storage → Policies (expressions dans le fichier), puis relancer `0010`.

Contrôle rapide :

```sql
select (select count(*) from pg_policies where schemaname = 'public') as politiques,      -- 44
       to_regprocedure('private.is_admin()') as is_admin,                                 -- private.is_admin()
       (select count(*) from units) as unites,                                            -- 37
       (select public from storage.buckets where id = 'recipe-photos') as bucket_public;  -- true
```

## 3. Authentification

1. **Hook JWT** (après 0009, sinon il n'apparaît pas) : Authentication → Hooks →
   *Customize Access Token (JWT) Claims* → type Postgres, schéma `public`, fonction
   `custom_access_token_hook` → Enable.
2. **URL Configuration** : *Site URL* = l'URL du site ; *Redirect URLs* : `/confirm`,
   `/en/confirm`, `/reset-password`, `/en/reset-password` sur ce domaine.
3. **Email** : *Email OTP Expiration* < 3600 s ; activer la protection contre les mots de
   passe divulgués.
4. **Google** (optionnel) : client OAuth « Web application » dans Google Cloud, URI de
   redirection `https://<ref>.supabase.co/auth/v1/callback` ; puis Authentication →
   Sign In / Providers → Google : Client ID et Client Secret. Sans Google, définir
   `NUXT_PUBLIC_AUTH_PROVIDERS=none` dans l'application.

## 4. Premier administrateur

Créer le compte depuis l'application (inscription), puis dans le SQL Editor :

```sql
begin;
select set_config('request.jwt.claims', '{"user_role":"admin"}', true);
update public.profiles set role = 'admin' where email = 'prenom@exemple.fr';
commit;
```

(Le trigger `prevent_role_change` refuse sinon la modification.) Se reconnecter ensuite.

## 5. Brancher l'application

Variables à définir (Vercel → Settings → Environment Variables, ou `.env.local` pour un
essai local) : `SUPABASE_URL`, `SUPABASE_ANON_KEY` (clé publishable), puis les variables
facultatives listées dans [env.example](env.example).

Régénérer les types si le schéma a divergé :
`npx supabase gen types typescript --project-id <ref> --schema public > shared/types/database.ts`.
