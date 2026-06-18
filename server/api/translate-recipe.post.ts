import OpenAI from 'openai'
import { defineEventHandler, readBody, createError } from 'h3'

export default defineEventHandler(async (event) => {
  try {
    // Réservé aux administrateurs (évite l'abus de la facturation OpenAI)
    await requireAdmin(event)

    const body = await readBody(event)
    const { recipeText, translateToFrench = true } = body

    if (!recipeText) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Le texte de la recette est requis'
      })
    }

    // Vérifier que la clé API est configurée
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
      throw createError({
        statusCode: 500,
        statusMessage: 'Clé API OpenAI non configurée. Veuillez configurer OPENAI_API_KEY dans votre fichier .env'
      })
    }

    // Initialiser le client OpenAI
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })

    // Prompt pour convertir la recette en JSON structuré
    const languageInstruction = translateToFrench 
      ? 'en français' 
      : 'dans la langue d\'origine de la recette'
    
    const prompt = `
    Convertis cette recette en format JSON structuré ${languageInstruction} avec un système de sections.
    Le JSON doit contenir les champs suivants :
    {
      "id": "1",
      "title": "Nom de la recette",
      "description": "Description courte", // Si elle existe, sinon laisser vide (ne pas générer de description)
      "category": "plats", // soupes, entrees, plats, poissons, viandes, yaourts et fromages, desserts et gâteaux, boissons, confitures
      "ingredients": [
        { "name": "Ingrédient", "amount": 1, "unit": "g" }
      ], // Garder pour compatibilité, mais utiliser sections de préférence
      "instructions": [
        "Étape 1",
        "Étape 2"
      ], // Garder pour compatibilité, mais utiliser sections de préférence
      "sections": [
        {
          "name": "Nom de la section (ex: 'Pour la pâte', 'Pour la garniture', 'Ingrédients', 'Préparation')",
          "type": "ingredients", // "ingredients", "instructions", ou "mixed"
          "orderIndex": 0,
          "ingredients": [
            { "name": "Ingrédient", "amount": 1, "unit": "g", "optional": false, "orderIndex": 0 }
          ],
          "instructions": [
            { "content": "Étape de préparation", "orderIndex": 0 }
          ]
        }
      ],
      "prepTime": 0,        // Temps de préparation en minutes
      "cookTime": 0,        // Temps de cuisson en minutes
      "servings": 1,         // Nombre de portions
      "image": "/images/plats.png", // soupes, entrees, plats, poissons, viandes, yaourts et fromages, desserts et gâteaux, boissons, confitures
      "tags": ["végétarien"], // Tags disponibles: "végétarien", "vegan"
      "favorite": false,     // Boolean
      "notes": "Astuce ou conseil personnel (optionnel)" // toute information dans la recette qui ne correspond pas aux champs ci-dessus, ou des informations supplémentaires, ne rien inventer
    }

    Règles TRÈS IMPORTANTES pour les sections :
    
    DÉTECTION DES SOUS-SECTIONS :
       - Les sous-sections peuvent être identifiées de plusieurs façons :
         a) Par un sous-titre suivi de deux-points (ex: "Pour la pâte:", "Pour la garniture:")
         b) Par un saut de ligne (ligne vide) suivi d'une ligne qui semble être un titre de section, puis plusieurs lignes
         c) Par un saut de ligne suivi directement de plusieurs lignes d'instructions (dans ce cas, la première ligne après le saut peut être le titre de la section)
       - Si tu détectes un saut de ligne (ligne vide) suivi d'une ligne qui ressemble à un titre (court, descriptif, parfois suivi de ':'), puis plusieurs lignes d'instructions, crée une section SÉPARÉE.
       - Le nom de la section doit être le sous-titre exact (sans les deux-points, mais garde les points de suspension si présents). Si c'est une ligne après un saut de ligne, utilise cette ligne comme titre.
       - Toutes les instructions ou ingrédients qui suivent ce sous-titre jusqu'au prochain saut de ligne + titre (ou la fin) appartiennent à cette section.
       - Si une sous-section porte le nom "Notes", ajoute le contenu de cette section à la section "notes" du JSON.
       - S'il n'y a qu'une sous-section pour les ingrédients, créer une section SANS NOM (name: "") contenant touts les ingrédients.
       - S'il n'y a qu'une sous-section pour les instructions, créer une section SANS NOM (name: "") contenant toutes les instructions.


   Règle "NE JAMAIS PERDRE D'ÉLÉMENTS" :
    - Tous les ingrédients et instructions de la recette originale DOIVENT être inclus dans les sections.
    - Si un ingrédient ou une instruction ne correspond à aucune sous-section, créer une section SANS NOM (name: "") pour le contenir.
    
    RECETTE SIMPLE SANS SOUS-SECTIONS :
       - Si la recette n'a pas de sous-sections claires (pas de sous-titres avec deux-points, pas de sauts de ligne suivis de titres), crée une section "" (type "ingredients") avec tous les ingrédients.
       - Et une section "" (type "instructions") avec toutes les instructions.
       - ATTENTION : Ne crée pas de sections par défaut si tu détectes des sauts de ligne ou des sous-titres. Analyse d'abord la structure avant de décider.
    
    ORDRE ET INDEXATION :
       - Chaque section doit avoir un orderIndex (commence à 0, incrémente de 1).
       - Les ingrédients et instructions dans chaque section doivent avoir leur propre orderIndex (commence à 0).
       - Respectez l'ordre d'apparition dans la recette originale.
    
    6. FORMAT DES DONNÉES :
       - Ingrédients : name (string), amount (number ou null), unit (string ou null), optional (boolean, false par défaut), orderIndex (number).
       - Instructions : content (string), orderIndex (number).

    Recette à convertir :
    ${recipeText}

    Retourne uniquement le JSON valide, sans texte supplémentaire. ${translateToFrench ? 'Si la recette est en anglais ou dans une autre langue, retourne le JSON en français.' : 'Retourne le JSON dans la langue d\'origine de la recette, sans traduire.'}
    `

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Tu es un expert en conversion de recettes en format JSON structuré avec sections. Tu détectes TOUJOURS les sous-sections dans les instructions et ingrédients en cherchant : 1) des sous-titres suivis de ':', 2) des sauts de ligne (lignes vides) suivis d'une ligne qui ressemble à un titre puis plusieurs lignes de contenu. Tu crées une section séparée pour chaque sous-section détectée. ${translateToFrench ? 'Tu traduis toujours le contenu en français.' : 'Tu conserves la langue d\'origine de la recette, sans traduire.'} Tu retournes toujours un JSON valide et bien formaté, sans texte supplémentaire.`
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3, // Augmenté légèrement pour plus de flexibilité dans la détection des sections (sauts de ligne, formats variés)
      max_tokens: 3000, // Augmenté pour gérer les recettes avec plusieurs sections
      response_format: { type: "json_object" }
    })

    const translatedRecipe = response.choices[0]?.message?.content

    if (!translatedRecipe) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Erreur lors de la génération de la réponse'
      })
    }

    // Essayer de parser le JSON pour vérifier qu'il est valide
    try {
      JSON.parse(translatedRecipe)
    } catch (parseError) {
      throw createError({
        statusCode: 500,
        statusMessage: 'La réponse générée n\'est pas un JSON valide'
      })
    }

    return {
      translatedRecipe,
      success: true
    }

  } catch (error: any) {
    console.error('Erreur lors de la traduction:', error)
    
    // Gestion spécifique des erreurs OpenAI
    if (error.statusCode) {
      throw error
    }

    // Erreurs spécifiques OpenAI
    if (error.code === 'invalid_api_key') {
      throw createError({
        statusCode: 401,
        statusMessage: 'Clé API OpenAI invalide. Veuillez vérifier votre configuration.'
      })
    }

    if (error.code === 'insufficient_quota') {
      throw createError({
        statusCode: 402,
        statusMessage: 'Quota OpenAI insuffisant. Veuillez vérifier votre compte.'
      })
    }

    if (error.code === 'model_not_found') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Modèle OpenAI non trouvé. Veuillez vérifier le nom du modèle.'
      })
    }

    throw createError({
      statusCode: 500,
      statusMessage: `Erreur interne du serveur: ${error.message || 'Erreur inconnue'}`
    })
  }
}) 