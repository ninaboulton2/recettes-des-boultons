# Import depuis Google Drive : mise en place (Google Cloud + Vercel)

À faire **une seule fois** par Nina, dans la console Google Cloud puis dans Vercel. Sans ces
étapes le bouton « Importer depuis Google Drive » du traducteur reste **masqué** : rien ne casse.

Principe : le bouton ouvre la fenêtre de connexion Google, puis le sélecteur de fichiers Google
Drive. L'appli ne peut lire **que le fichier choisi** (portée `drive.file`, jamais tout le Drive),
tout se passe dans le navigateur, aucun jeton n'est enregistré. Détails techniques : section
« Import depuis Google Drive » de [DEVELOPER.md](../DEVELOPER.md).

> Utiliser le **même projet Google Cloud** que celui de la connexion Google de Supabase (le
> client OAuth existant). Aucun nouveau projet, aucune carte bancaire.

## Étape A : Google Cloud Console (https://console.cloud.google.com)

1. **Choisir le projet** : en haut de la page, le sélecteur de projet, puis celui qui contient le
   client OAuth utilisé pour « Continuer avec Google » (voir `SUPABASE_SETUP.md`). En cas de
   doute : menu **API et services > Identifiants**, le client « Application Web » dont l'URI de
   redirection se termine par `.supabase.co/auth/v1/callback`.

2. **Activer les deux API** : menu **API et services > Bibliothèque**. Chercher, ouvrir puis
   cliquer sur **Activer** pour chacune :
   - **Google Picker API** ;
   - **Google Drive API**.

3. **Noter le numéro du projet** (c'est `NUXT_PUBLIC_GOOGLE_APP_ID`) : page d'accueil de la
   console (**Tableau de bord**), carte **Informations sur le projet**, ligne **Numéro du
   projet** (uniquement des chiffres, par exemple `123456789012`). À ne pas confondre avec
   « ID du projet » (du texte). Même information dans **IAM et administration > Paramètres**.

4. **Autoriser le site sur le client OAuth** : **API et services > Identifiants**, cliquer sur le
   client OAuth existant, section **Origines JavaScript autorisées**, **Ajouter un URI**, une
   ligne par adresse (sans `/` final, sans chemin) :
   - `https://recettes-des-boultons.vercel.app`
   - `http://localhost:3001` (le port de `npm run dev:local`)
   - `http://localhost:3000` (au cas où le site est lancé sur ce port)

   Ne touchez pas aux **URI de redirection autorisés** (ils servent à la connexion Supabase).
   Puis **Enregistrer**. Google annonce que la prise en compte peut durer de quelques minutes à
   quelques heures (en pratique quelques minutes).
   Copier aussi l'**ID client** (finit par `.apps.googleusercontent.com`) : c'est
   `NUXT_PUBLIC_GOOGLE_CLIENT_ID`. Ne **pas** copier le « code secret du client » : il n'est pas
   utilisé ici.

5. **Ajouter la portée `drive.file` à l'écran de consentement** : menu **API et services >
   Écran de consentement OAuth** (ou « Google Auth Platform ») puis **Accès aux données**
   (« Data Access »), **Ajouter ou supprimer des niveaux d'accès**. Dans le filtre, chercher
   `drive.file` et cocher :
   `https://www.googleapis.com/auth/drive.file` (« Afficher et gérer les fichiers Google Drive
   que vous avez ouverts ou créés avec cette application »). **Mettre à jour**, puis
   **Enregistrer**. Les portées déjà présentes (`email`, `profile`, `openid`) restent.

6. **Créer la clé d'API** (c'est `NUXT_PUBLIC_GOOGLE_API_KEY`) : **API et services >
   Identifiants > Créer des identifiants > Clé API**. Dans la fenêtre qui s'ouvre, cliquer
   **Restreindre la clé** (ou plus tard sur le nom de la clé) :
   - **Restrictions relatives aux applications** : **Sites Web**, puis **Ajouter** un par un :
     `https://recettes-des-boultons.vercel.app/*`, `http://localhost:3001/*`,
     `http://localhost:3000/*` ;
   - **Restrictions relatives aux API** : **Restreindre la clé**, cocher **Google Picker API**
     uniquement ;
   - **Enregistrer**. Nommer la clé par exemple « Recettes Boultons : Picker ».

   Cette clé n'est pas un secret (elle est visible dans le navigateur) : c'est la restriction par
   site et par API qui la protège.

## Étape B : publication et vérification de l'écran de consentement

7. **Où en est l'application ?** **Écran de consentement OAuth > Public** (« Audience »), ligne
   **État de la publication** :
   - **En production** (probablement le cas si la connexion Google fonctionne pour toute la
     famille) : rien à changer. `drive.file` est une portée **non sensible** : pas d'évaluation
     de sécurité, pas de vidéo de démonstration. Google peut au plus demander la « validation de
     la marque » (nom, logo, pages légales), et tant qu'elle n'est pas faite, l'écran peut
     afficher « Google n'a pas validé cette application » (cliquer « Paramètres avancés » puis
     « Accéder à … »). Une appli non validée est limitée à 100 nouveaux utilisateurs au total :
     sans conséquence ici, seuls les administrateurs utilisent le traducteur.
   - **Test** : seuls les **utilisateurs tests** listés (maximum 100) peuvent s'autoriser :
     ajouter l'adresse Google de chaque administrateur dans **Utilisateurs tests**, sinon Google
     répond « accès bloqué : cette application n'a pas terminé la procédure de validation ».
     En mode Test, l'autorisation expire au bout de 7 jours (la fenêtre de consentement
     réapparaît, rien d'autre). Le plus simple : cliquer **Publier l'application** (passage en
     production, sans risque avec une portée non sensible).

## Étape C : Vercel (https://vercel.com, projet recettes-des-boultons)

8. **Settings > Environment Variables**, ajouter ces **3 variables**, avec les environnements
   **Production** et **Preview** cochés (Development inutile) :

   | Nom | Valeur |
   |---|---|
   | `NUXT_PUBLIC_GOOGLE_CLIENT_ID` | l'ID client de l'étape 4 (`….apps.googleusercontent.com`) |
   | `NUXT_PUBLIC_GOOGLE_API_KEY` | la clé d'API de l'étape 6 |
   | `NUXT_PUBLIC_GOOGLE_APP_ID` | le numéro du projet de l'étape 3 (chiffres uniquement) |

   Aucune n'est secrète (le navigateur les voit). Il faut **les trois** : s'il en manque une,
   le bouton reste masqué.

9. **Redéployer** (Deployments > le dernier déploiement > menu `...` > Redeploy) pour que la
   nouvelle configuration soit prise en compte.

   Attention aux **déploiements Preview** : leur adresse change à chaque déploiement
   (`recettes-xxxx-….vercel.app`) et Google n'accepte pas de joker dans les origines JavaScript.
   Sur une Preview, le bouton apparaît mais Google répondra « Erreur 400 : origin_mismatch »,
   sauf si l'adresse exacte a été ajoutée à l'étape 4. Pour tester avant de fusionner, ajouter
   cette adresse précise ou tester en local.

## Étape D : vérifier

10. Se connecter en administrateur, ouvrir **Traducteur IA**, cliquer **Importer depuis Google
    Drive** : fenêtre Google (choix du compte, consentement la première fois : « Afficher et gérer
    les fichiers Google Drive que vous avez ouverts ou créés avec cette application »), puis le
    sélecteur Drive. Choisir un PDF, une photo, un `.txt` / `.md` ou un Google Docs : un texte
    arrive dans la zone de saisie, une photo ou un PDF dans la liste des fichiers à analyser.
    Les Google Sheets et Slides sont refusés (message « Format non pris en charge »).
11. Pour essayer en local : mettre les trois valeurs dans `.env.local`
    (voir `.env.local.example`) et lancer `npm run dev:local` (port 3001, autorisé à l'étape 4).

## En cas de problème

| Symptôme | Cause probable |
|---|---|
| Pas de bouton | Une des 3 variables manque (ou pas de redéploiement après leur ajout). |
| « Erreur 400 : origin_mismatch » | L'adresse du site n'est pas dans les **Origines JavaScript autorisées** (étape 4), ou l'enregistrement n'est pas encore pris en compte. |
| « Accès bloqué » / « application non validée » | Appli en mode Test et compte absent des **Utilisateurs tests** (étape 7). |
| Message « fenêtre bloquée » | Autoriser les fenêtres pop-up pour le site, puis recliquer. |
| Sélecteur vide ou « The API developer key is invalid » | Clé d'API mal copiée, ou restreinte à un autre site ou à une autre API (étape 6). |
| « Accès à Google Drive refusé » à l'import | Google Drive API non activée (étape 2), ou autorisation refusée dans la fenêtre Google. |

## Coûts et confidentialité

- **Gratuit** : Google Picker API, Google Drive API et Google Identity Services n'ont pas de
  facturation ; les quotas gratuits (plusieurs milliers de requêtes par jour et par projet) sont
  très au-dessus d'un usage familial. Aucun compte de facturation n'est nécessaire.
- L'appli ne voit que le fichier choisi, pendant l'import. Rien n'est enregistré côté serveur : le
  contenu rejoint le traducteur comme un fichier déposé à la main (donc, ensuite, un appel IA
  comptabilisé dans le quota habituel si l'on clique sur « Structurer la recette »).
- Pour retirer l'accès : https://myaccount.google.com/permissions, puis l'application.
