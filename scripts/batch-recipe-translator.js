#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const http = require('http');
const https = require('https');

// Couleurs pour la console
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m'
};

// Configuration
const CONFIG = {
  // Dossier contenant les fichiers à traiter
  inputFolder: process.argv[2],
  // Extensions de fichiers à traiter
  supportedExtensions: ['.txt', '.md', '.doc', '.docx'],
  // Délai entre les requêtes (en ms) pour éviter de surcharger l'API
  delayBetweenRequests: 2000,
  // Fichier de log
  logFile: './batch-translation.log'
};

// Fonction pour logger les messages avec couleurs
function log(message, type = 'INFO') {
  const timestamp = new Date().toISOString();
  
  // Couleurs selon le type de message
  let color = colors.white;
  let prefix = '';
  
  switch (type) {
    case 'SUCCESS':
      color = colors.green;
      prefix = '✅';
      break;
    case 'ERROR':
      color = colors.red;
      prefix = '❌';
      break;
    case 'WARNING':
      color = colors.yellow;
      prefix = '⚠️';
      break;
    case 'INFO':
      color = colors.cyan;
      prefix = 'ℹ️';
      break;
    case 'PROGRESS':
      color = colors.blue;
      prefix = '🔄';
      break;
    case 'HEADER':
      color = colors.magenta + colors.bright;
      prefix = '📋';
      break;
    default:
      color = colors.white;
      prefix = '•';
  }
  
  const coloredMessage = `${color}${prefix} ${message}${colors.reset}`;
  const logMessage = `[${timestamp}] [${type}] ${message}`;
  
  console.log(coloredMessage);
  
  // Écrire dans le fichier de log (sans couleurs)
  fs.appendFileSync(CONFIG.logFile, logMessage + '\n');
}

// Fonction pour faire une pause
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Fonction pour faire une requête HTTP
function makeHttpRequest(options, data) {
  return new Promise((resolve, reject) => {
    const url = new URL(options.url);
    const requestOptions = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 3000),
      path: url.pathname,
      method: options.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const client = url.protocol === 'https:' ? https : http;
    
    const req = client.request(requestOptions, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(responseData);
          resolve(response);
        } catch (error) {
          reject(new Error(`Erreur de parsing JSON: ${error.message}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(new Error(`Erreur de requête HTTP: ${error.message}`));
    });
    
    req.write(data);
    req.end();
  });
}

// Fonction pour appeler l'API de traduction
async function translateRecipe(recipeText) {
  try {
    const data = JSON.stringify({ recipeText });
    
    const response = await makeHttpRequest({
      url: 'http://localhost:3000/api/translate-recipe',
      method: 'POST'
    }, data);
    
    if (response.success) {
      return JSON.parse(response.translatedRecipe);
    } else {
      throw new Error('Échec de la traduction');
    }
  } catch (error) {
    throw new Error(`Erreur lors de la traduction: ${error.message}`);
  }
}

// Fonction pour ajouter une recette
async function addRecipe(recipe) {
  try {
    const data = JSON.stringify({ recipe });
    
    const response = await makeHttpRequest({
      url: 'http://localhost:3000/api/add-recipe',
      method: 'POST'
    }, data);
    
    if (response.success) {
      return response.recipe;
    } else {
      throw new Error('Échec de l\'ajout de la recette');
    }
  } catch (error) {
    throw new Error(`Erreur lors de l'ajout de la recette: ${error.message}`);
  }
}

// Fonction pour lire le contenu d'un fichier
function readFileContent(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  
  if (extension === '.txt' || extension === '.md') {
    return fs.readFileSync(filePath, 'utf8');
  } else if (extension === '.doc' || extension === '.docx') {
    // Pour les fichiers Word, on utilise un outil externe
    try {
      const command = `textutil -convert txt -stdout "${filePath}"`;
      return execSync(command, { encoding: 'utf8' });
    } catch (error) {
      log(`Impossible de lire le fichier Word ${filePath}: ${error.message}`, 'ERROR');
      return null;
    }
  }
  
  return null;
}

// Fonction pour traiter un fichier
async function processFile(filePath) {
  const fileName = path.basename(filePath);
  log(`Traitement du fichier: ${fileName}`, 'INFO');
  
  try {
    // Lire le contenu du fichier
    const content = readFileContent(filePath);
    if (!content) {
      log(`Impossible de lire le contenu du fichier: ${fileName}`, 'ERROR');
      return false;
    }
    
    // Vérifier que le contenu n'est pas vide
    if (content.trim().length === 0) {
      log(`Fichier vide: ${fileName}`, 'WARNING');
      return false;
    }
    
    log(`Contenu lu (${content.length} caractères): ${fileName}`, 'INFO');
    
    // Traduire le contenu en recette
    log(`Traduction en cours: ${fileName}`, 'PROGRESS');
    const translatedRecipe = await translateRecipe(content);
    
    if (!translatedRecipe) {
      log(`Échec de la traduction: ${fileName}`, 'ERROR');
      return false;
    }
    
    log(`Recette traduite avec succès: ${translatedRecipe.title || 'Sans titre'}`, 'SUCCESS');
    
    // Ajouter la recette à la base de données
    log(`Ajout de la recette: ${translatedRecipe.title || 'Sans titre'}`, 'INFO');
    const addedRecipe = await addRecipe(translatedRecipe);
    
    if (addedRecipe) {
      log(`Recette ajoutée avec succès - ID: ${addedRecipe.id}, Titre: ${addedRecipe.title}`, 'SUCCESS');
      return true;
    } else {
      log(`Échec de l'ajout de la recette: ${fileName}`, 'ERROR');
      return false;
    }
    
  } catch (error) {
    log(`Erreur lors du traitement de ${fileName}: ${error.message}`, 'ERROR');
    return false;
  }
}

// Fonction principale
async function main() {
  log('=== Début du traitement par lot des recettes ===', 'HEADER');
  
  // Vérifier qu'un dossier a été spécifié
  if (!CONFIG.inputFolder) {
    log('Erreur: Aucun dossier spécifié', 'ERROR');
    log('Usage: node scripts/batch-recipe-translator.js <chemin-vers-dossier>', 'ERROR');
    log('Exemple: node scripts/batch-recipe-translator.js /chemin/vers/mes/recettes', 'ERROR');
    process.exit(1);
  }
  
  // Vérifier que le dossier d'entrée existe
  if (!fs.existsSync(CONFIG.inputFolder)) {
    log(`Le dossier d'entrée n'existe pas: ${CONFIG.inputFolder}`, 'ERROR');
    process.exit(1);
  }
  
  // Lire tous les fichiers du dossier
  const files = fs.readdirSync(CONFIG.inputFolder)
    .filter(file => {
      const extension = path.extname(file).toLowerCase();
      return CONFIG.supportedExtensions.includes(extension);
    })
    .map(file => path.join(CONFIG.inputFolder, file));
  
  if (files.length === 0) {
    log(`Aucun fichier à traiter dans le dossier: ${CONFIG.inputFolder}`, 'WARNING');
    process.exit(0);
  }
  
  log(`Nombre de fichiers à traiter: ${files.length}`, 'INFO');
  
  let successCount = 0;
  let errorCount = 0;
  
  // Traiter chaque fichier
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    log(`Progression: ${i + 1}/${files.length}`, 'PROGRESS');
    
    const success = await processFile(file);
    
    if (success) {
      successCount++;
    } else {
      errorCount++;
    }
    
    // Pause entre les requêtes
    if (i < files.length - 1) {
      log(`Pause de ${CONFIG.delayBetweenRequests}ms avant le prochain fichier...`, 'INFO');
      await sleep(CONFIG.delayBetweenRequests);
    }
  }
  
  // Résumé final
  log('=== Résumé du traitement ===', 'HEADER');
  log(`Fichiers traités avec succès: ${successCount}`, 'SUCCESS');
  log(`Fichiers en erreur: ${errorCount}`, errorCount > 0 ? 'ERROR' : 'INFO');
  log(`Total: ${files.length}`, 'INFO');
  log('=== Fin du traitement ===', 'HEADER');
}

// Gestion des erreurs non capturées
process.on('unhandledRejection', (reason, promise) => {
  log(`Promesse rejetée non gérée: ${reason}`, 'ERROR');
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  log(`Exception non capturée: ${error.message}`, 'ERROR');
  process.exit(1);
});

// Lancer le script
if (require.main === module) {
  main().catch(error => {
    log(`Erreur fatale: ${error.message}`, 'ERROR');
    process.exit(1);
  });
}

module.exports = {
  processFile,
  translateRecipe,
  addRecipe
}; 