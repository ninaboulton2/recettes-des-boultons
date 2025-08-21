# Guide de Déploiement - Système d'Authentification

## Préparation du déploiement

### 1. Génération de credentials sécurisés

Avant de déployer en production, générez des credentials sécurisés :

```bash
# Générer des credentials sécurisés
node scripts/generate-credentials.js

# Les credentials seront affichés et sauvegardés dans credentials-temp.json
# ⚠️ IMPORTANT: Sauvegardez ces informations dans un endroit sécurisé !
```

### 2. Configuration des variables d'environnement

Créez un fichier `.env` en production avec les credentials générés :

```bash
# Copier l'exemple de production
cp config/production.env.example .env

# Éditer le fichier avec vos credentials
nano .env
```

**Exemple de configuration :**
```bash
ADMIN_USERNAME=admin_e0b9ce06d90d63ba
ADMIN_PASSWORD=nZ<gG,BY*dd3nqN:5nGuxHOemefi
JWT_SECRET=a6d48bf4db3ddccd433485ef11841aa0f75b9658c138ca4b48acea4fa3f44da5b426de96a963320f446c2f9aa1fc4ebb1a8708382e2d6c5cd14d21822ed03e10
API_BASE=https://votre-domaine.com
NODE_ENV=production
```

### 3. Vérification de la sécurité

Avant le déploiement, vérifiez que :

- ✅ Les credentials par défaut ont été changés
- ✅ La clé JWT_SECRET est suffisamment longue (64+ caractères)
- ✅ Le mot de passe est complexe (majuscules, minuscules, chiffres, caractères spéciaux)
- ✅ HTTPS est configuré sur votre serveur
- ✅ Les variables d'environnement ne sont pas exposées dans le code

## Déploiement

### Option 1: Déploiement manuel

```bash
# Construire l'application
npm run build

# Démarrer en production
npm start
```

### Option 2: Déploiement avec PM2

```bash
# Installer PM2
npm install -g pm2

# Construire l'application
npm run build

# Démarrer avec PM2
pm2 start ecosystem.config.js

# Sauvegarder la configuration PM2
pm2 save

# Configurer le démarrage automatique
pm2 startup
```

### Option 3: Déploiement avec Docker

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3001
CMD ["npm", "start"]
```

```bash
# Construire l'image
docker build -t boultons-recipes .

# Lancer le conteneur
docker run -d \
  --name boultons-recipes \
  -p 3001:3001 \
  --env-file .env \
  boultons-recipes
```

## Configuration du serveur web

### Nginx (recommandé)

```nginx
server {
    listen 80;
    server_name votre-domaine.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name votre-domaine.com;

    # Certificats SSL
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # Configuration de sécurité SSL
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # Headers de sécurité
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Apache

```apache
<VirtualHost *:80>
    ServerName votre-domaine.com
    Redirect permanent / https://votre-domaine.com/
</VirtualHost>

<VirtualHost *:443>
    ServerName votre-domaine.com
    
    SSLEngine on
    SSLCertificateFile /path/to/cert.pem
    SSLCertificateKeyFile /path/to/key.pem
    
    ProxyPreserveHost On
    ProxyPass / http://localhost:3001/
    ProxyPassReverse / http://localhost:3001/
    
    # Headers de sécurité
    Header always set X-Frame-Options DENY
    Header always set X-Content-Type-Options nosniff
    Header always set X-XSS-Protection "1; mode=block"
    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
</VirtualHost>
```

## Sécurité en production

### 1. Firewall

```bash
# Configurer UFW (Ubuntu/Debian)
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable

# Configurer iptables (CentOS/RHEL)
sudo iptables -A INPUT -p tcp --dport 22 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 443 -j ACCEPT
sudo iptables -A INPUT -j DROP
```

### 2. Surveillance et monitoring

```bash
# Installer des outils de monitoring
npm install -g pm2-monitoring

# Configurer des alertes
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
```

### 3. Sauvegarde

```bash
# Script de sauvegarde automatique
#!/bin/bash
BACKUP_DIR="/backups/boultons-recipes"
DATE=$(date +%Y%m%d_%H%M%S)

# Créer le répertoire de sauvegarde
mkdir -p $BACKUP_DIR

# Sauvegarder les données
tar -czf $BACKUP_DIR/backup_$DATE.tar.gz \
  --exclude=node_modules \
  --exclude=.git \
  --exclude=dist \
  .

# Supprimer les sauvegardes de plus de 30 jours
find $BACKUP_DIR -name "backup_*.tar.gz" -mtime +30 -delete
```

## Tests post-déploiement

### 1. Vérification de la sécurité

```bash
# Tester l'authentification
curl -X POST https://votre-domaine.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"votre-username","password":"votre-password"}'

# Vérifier que les routes protégées sont bien sécurisées
curl https://votre-domaine.com/api/add-recipe
# Devrait retourner 401 Unauthorized
```

### 2. Test de performance

```bash
# Installer et utiliser Apache Bench
sudo apt-get install apache2-utils

# Test de charge
ab -n 1000 -c 10 https://votre-domaine.com/
```

### 3. Vérification SSL

```bash
# Vérifier la configuration SSL
curl -I https://votre-domaine.com/

# Utiliser des outils en ligne
# - SSL Labs: https://www.ssllabs.com/ssltest/
# - Security Headers: https://securityheaders.com/
```

## Maintenance

### 1. Mise à jour des credentials

```bash
# Générer de nouveaux credentials
node scripts/generate-credentials.js

# Mettre à jour le fichier .env
# Redémarrer l'application
pm2 restart boultons-recipes
```

### 2. Rotation des logs

```bash
# Configurer la rotation automatique des logs
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
pm2 set pm2-logrotate:compress true
```

### 3. Surveillance continue

```bash
# Vérifier le statut de l'application
pm2 status
pm2 logs boultons-recipes

# Surveiller les ressources
pm2 monit
```

## Support et dépannage

### Logs utiles

```bash
# Logs de l'application
pm2 logs boultons-recipes

# Logs du serveur web
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Logs système
sudo journalctl -u nginx -f
```

### Problèmes courants

1. **Erreur 502 Bad Gateway** : Vérifier que l'application Node.js fonctionne
2. **Erreur SSL** : Vérifier les certificats et la configuration HTTPS
3. **Erreur d'authentification** : Vérifier les variables d'environnement
4. **Performance lente** : Vérifier la configuration du serveur et de la base de données

### Contacts d'urgence

- **Documentation** : AUTHENTICATION.md
- **Scripts de test** : scripts/test-auth.js
- **Génération de credentials** : scripts/generate-credentials.js 