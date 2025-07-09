#!/bin/bash

# Script de démarrage pour la traduction par lot des recettes
# Usage: ./scripts/start-batch-translation.sh [dossier]

set -e  # Arrêter en cas d'erreur

# Couleurs pour les messages
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Fonction pour afficher les messages colorés
print_message() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE}  Traduction Par Lot des Recettes${NC}"
    echo -e "${BLUE}================================${NC}"
}

# Afficher l'en-tête
print_header

# Vérifier si Node.js est installé
if ! command -v node &> /dev/null; then
    print_error "Node.js n'est pas installé. Veuillez l'installer d'abord."
    exit 1
fi

# Vérifier si le serveur Nuxt est en cours d'exécution
print_message "Vérification du serveur Nuxt..."
if ! curl -s http://localhost:3000 > /dev/null; then
    print_warning "Le serveur Nuxt ne semble pas être en cours d'exécution."
    print_message "Démarrage du serveur en arrière-plan..."
    
    # Démarrer le serveur en arrière-plan
    npm run dev > /dev/null 2>&1 &
    SERVER_PID=$!
    
    # Attendre que le serveur démarre
    print_message "Attente du démarrage du serveur..."
    sleep 10
    
    # Vérifier à nouveau
    if ! curl -s http://localhost:3000 > /dev/null; then
        print_error "Impossible de démarrer le serveur. Veuillez le démarrer manuellement avec 'npm run dev'"
        exit 1
    fi
    
    print_message "Serveur démarré avec succès (PID: $SERVER_PID)"
else
    print_message "Serveur Nuxt détecté et fonctionnel"
fi

# Vérifier qu'un dossier a été spécifié
if [ -z "$1" ]; then
    print_error "Aucun dossier spécifié"
    print_message "Usage: ./scripts/start-batch-translation.sh <chemin-vers-dossier>"
    print_message "Exemple: ./scripts/start-batch-translation.sh /chemin/vers/mes/recettes"
    exit 1
fi

# Déterminer le dossier à traiter
INPUT_FOLDER="$1"

print_message "Dossier à traiter: $INPUT_FOLDER"

# Vérifier si le dossier existe
if [ ! -d "$INPUT_FOLDER" ]; then
    print_error "Le dossier '$INPUT_FOLDER' n'existe pas."
    print_message "Veuillez spécifier un chemin valide vers un dossier existant."
    print_message "Exemple: ./scripts/start-batch-translation.sh /chemin/vers/votre/dossier"
    exit 1
fi

# Compter les fichiers à traiter
FILE_COUNT=$(find "$INPUT_FOLDER" -type f \( -name "*.txt" -o -name "*.md" -o -name "*.doc" -o -name "*.docx" \) | wc -l)

if [ "$FILE_COUNT" -eq 0 ]; then
    print_error "Aucun fichier à traiter dans le dossier '$INPUT_FOLDER'"
    print_message "Le dossier doit contenir des fichiers avec les extensions: .txt, .md, .doc, .docx"
    exit 1
fi

print_message "Nombre de fichiers à traiter: $FILE_COUNT"

# Demander confirmation
echo
read -p "Voulez-vous continuer avec la traduction ? (y/N): " -n 1 -r
echo

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_message "Traduction annulée"
    exit 0
fi

# Lancer la traduction
print_message "Démarrage de la traduction par lot..."
node scripts/batch-recipe-translator.js "$INPUT_FOLDER"

# Afficher le résumé
echo
print_message "Traduction terminée !"
print_message "Consultez le fichier 'batch-translation.log' pour les détails"

# Nettoyer le processus serveur si on l'a démarré
if [ ! -z "$SERVER_PID" ]; then
    print_message "Arrêt du serveur de développement..."
    kill $SERVER_PID 2>/dev/null || true
fi

print_message "Script terminé avec succès !" 