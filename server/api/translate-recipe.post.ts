import OpenAI from 'openai'
import { defineEventHandler, readBody, createError } from 'h3'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { recipeText } = body

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
    const prompt = `
    Convertis cette recette en format JSON structuré. 
    Le JSON doit contenir les champs suivants :
    {
      "id": "1",
      "title": "Nom de la recette",
      "description": "Description courte",
      "category": "plats", // soupes, entrees, plats, poissons, viandes, yaourts et fromages, desserts, boissons
      "ingredients": [
        { "name": "Ingrédient", "amount": 1, "unit": "g" }
      ],
      "instructions": [
        "Étape 1",
        "Étape 2"
      ],
      "prepTime": ,        // Temps de préparation en minutes
      "cookTime": ,        // Temps de cuisson en minutes
      "servings": ,         // Nombre de portions
      "image": "/images/plats.png", // soupes, entrees, plats, poissons, viandes, yaourts et fromages, desserts, boissons
      "tags": ["végétarien"], // Tags disponibles: "végétarien", "vegan"
      "favorite": false,     // Boolean
      "notes": "Astuce ou conseil personnel (optionnel)" // toute information dans la recette qui ne correspond pas aux champs ci-dessus
    }

    Recette à convertir :
    ${recipeText}

    Retourne uniquement le JSON valide, sans texte supplémentaire.
    `

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Tu es un expert en conversion de recettes en format JSON structuré. Tu retournes toujours un JSON valide et bien formaté, sans texte supplémentaire."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 2000,
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