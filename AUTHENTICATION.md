# Système d'Authentification Sécurisé - Les Boultons

## 🚨 **AVERTISSEMENT DE SÉCURITÉ**

**⚠️ IMPORTANT** : Ce système d'authentification a été entièrement sécurisé pour la production. 
Toutes les vulnérabilités critiques ont été corrigées.

## Vue d'ensemble

Ce système d'authentification sécurisé permet de protéger l'accès aux fonctionnalités d'administration du site de recettes des Boultons. Seul le compte admin configuré peut ajouter, modifier et supprimer des recettes.

## 🔒 **Mesures de Sécurité Implémentées**

### 1. **Protection contre les attaques par force brute**
- Limitation des tentatives de connexion (configurable)
- Blocage temporaire des IPs après échecs répétés
- Délai d'attente progressif
- Logging des tentatives de connexion

### 2. **Gestion sécurisée des tokens JWT**
- Clés secrètes de 64+ caractères minimum
- Expiration automatique des tokens (24h)
- Validation stricte des tokens côté serveur
- Revocation automatique des tokens expirés

### 3. **Cookies sécurisés**
- Stockage HttpOnly (protection XSS)
- Flag Secure en production (HTTPS requis)
- SameSite=Strict (protection CSRF)
- Expiration automatique

### 4. **En-têtes de sécurité**
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- X-XSS-Protection: 1; mode=block
- Strict-Transport-Security (HSTS)
- Referrer-Policy: strict-origin-when-cross-origin

### 5. **Configuration sécurisée**
- Variables d'environnement uniquement
- Validation de la configuration en production
- Logging de sécurité configurable
- Protection contre l'exposition des informations sensibles

## 🚀 **Installation et Configuration**

### 1. **Génération automatique de configuration sécurisée**

```bash
# Générer une configuration sécurisée complète
node scripts/generate-secure-config.js
```

Ce script génère automatiquement :
- Un nom d'utilisateur admin sécurisé
- Un mot de passe fort (16+ caractères)
- Une clé JWT aléatoire de 64+ caractères
- Un fichier .env.production sécurisé

### 2. **Configuration manuelle des variables d'environnement**

Créez un fichier `.env` à la racine du projet :

```bash
# Configuration d'authentification admin (OBLIGATOIRE)
ADMIN_USERNAME=votre-username-admin-securise
ADMIN_PASSWORD=VotreMotDePasseTresSecurise2024!@#$%^&*()

# Clé secrète JWT (OBLIGATOIRE - 64+ caractères)
JWT_SECRET=votre-cle-secrete-tres-longue-et-complexe-pour-la-production-2024

# Configuration de l'API
API_BASE=https://votre-domaine.com

# Environnement
NODE_ENV=production

# Configuration de sécurité
MAX_LOGIN_ATTEMPTS=5
LOGIN_TIMEOUT_MINUTES=15
LOGIN_BLOCK_DURATION_MINUTES=30

# Configuration des cookies sécurisés
COOKIE_SECURE=true
COOKIE_HTTPONLY=true
COOKIE_SAMESITE=strict
COOKIE_MAX_AGE=86400000

# Configuration de sécurité supplémentaire
ENABLE_RATE_LIMITING=true
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Configuration des en-têtes de sécurité
ENABLE_SECURITY_HEADERS=true
ENABLE_CORS=false
CORS_ORIGIN=https://votre-domaine.com

# Configuration du logging de sécurité
ENABLE_SECURITY_LOGGING=true
LOG_LEVEL=warn
```

### 3. **Vérification de la configuration**

```bash
# Vérifier que la configuration est sécurisée
npm run build
# Le build échouera si la configuration n'est pas sécurisée en production
```

## 🏗️ **Architecture de Sécurité**

### Composants de Sécurité

- **`stores/security.ts`** : Gestion des tentatives de connexion et protection anti-brute force
- **`middleware/security.global.ts`** : En-têtes de sécurité globaux
- **`middleware/auth.ts`** : Protection des routes avec validation des tokens
- **`utils/auth.ts`** : Utilitaires de sécurité et validation des mots de passe

### API Endpoints Sécurisés

- **`POST /api/auth/login`** : Authentification avec protection anti-brute force
- **`GET /api/auth/me`** : Vérification des tokens avec validation stricte

### Protection des Routes

Les routes suivantes sont automatiquement protégées :
- `/recettes/ajouter`
- `/recettes/modifier`
- `/api/add-recipe`
- `/api/update-recipe`
- `/api/delete-recipe`
- `/api/toggle-favorite`
- `/planning`
- `/favoris`

## 🔍 **Monitoring et Logging de Sécurité**

### Événements Loggés

- Tentatives de connexion (réussies/échouées)
- Blocages d'IP
- Tentatives d'accès non autorisées
- Tokens expirés ou invalides
- Erreurs de configuration de sécurité

### Configuration du Logging

```bash
# Activer le logging de sécurité
ENABLE_SECURITY_LOGGING=true
LOG_LEVEL=warn
```

## 🚨 **Réponse aux Incidents de Sécurité**

### 1. **Détection d'une attaque**
- Logs automatiques des tentatives suspectes
- Blocage automatique des IPs malveillantes
- Alertes en cas de configuration non sécurisée

### 2. **Actions recommandées**
- Vérifier les logs de sécurité
- Changer immédiatement les credentials admin
- Régénérer la clé JWT
- Vérifier l'intégrité du système

## 📋 **Checklist de Sécurité pour la Production**

### Avant le Déploiement
- [ ] Configuration sécurisée générée avec le script
- [ ] Variables d'environnement configurées
- [ ] HTTPS configuré sur le serveur
- [ ] Fichiers .env exclus du versioning
- [ ] Configuration de sécurité validée

### Après le Déploiement
- [ ] Test de connexion admin
- [ ] Vérification des en-têtes de sécurité
- [ ] Test de protection anti-brute force
- [ ] Vérification des logs de sécurité
- [ ] Test de déconnexion et expiration des tokens

## 🧪 **Tests de Sécurité**

### Tests Automatiques

```bash
# Vérifier la configuration de sécurité
npm run build

# Tester l'authentification
npm run test:auth
```

### Tests Manuels

1. **Test de force brute** : Essayer de se connecter avec de mauvais credentials
2. **Test de token expiré** : Attendre l'expiration et tenter d'accéder
3. **Test d'accès non autorisé** : Accéder aux routes protégées sans authentification
4. **Test des en-têtes de sécurité** : Vérifier les en-têtes HTTP

## 🆘 **Dépannage**

### Problèmes Courants

1. **Configuration non sécurisée** : Vérifier les variables d'environnement
2. **Erreur de connexion** : Vérifier les credentials et la configuration
3. **Accès refusé** : Vérifier l'authentification et les permissions
4. **Erreurs de build** : Vérifier la configuration de sécurité

### Logs de Débogage

```bash
# Activer les logs détaillés
LOG_LEVEL=debug
ENABLE_SECURITY_LOGGING=true
```

## 📞 **Support et Maintenance**

### Mise à Jour de Sécurité

- Surveiller les vulnérabilités des dépendances
- Mettre à jour régulièrement les packages
- Tester la configuration après chaque mise à jour

### Contact

Pour toute question de sécurité, consulter la documentation Nuxt ou créer une issue dans le projet.

---

**🔒 Ce système est maintenant prêt pour la production avec un niveau de sécurité élevé !** 