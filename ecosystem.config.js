module.exports = {
  apps: [
    {
      name: 'boultons-recipes',
      script: 'npm',
      args: 'start',
      cwd: './',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'development',
        PORT: 3001
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      // Configuration de sécurité
      max_memory_restart: '1G',
      min_uptime: '10s',
      max_restarts: 10,
      
      // Configuration des logs
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Configuration de surveillance
      watch: false,
      ignore_watch: ['node_modules', 'logs', '*.log'],
      
      // Configuration de redémarrage
      autorestart: true,
      restart_delay: 4000,
      
      // Configuration de performance
      node_args: '--max-old-space-size=1024',
      
      // Configuration de sécurité supplémentaire
      kill_timeout: 5000,
      listen_timeout: 3000,
      
      // Variables d'environnement spécifiques
      env_file: '.env'
    }
  ],

  // Configuration du déploiement
  deploy: {
    production: {
      user: 'deploy',
      host: 'votre-serveur.com',
      ref: 'origin/main',
      repo: 'git@github.com:votre-username/boultons-shopping-list.git',
      path: '/var/www/boultons-recipes',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
} 