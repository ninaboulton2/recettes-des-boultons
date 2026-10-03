import OpenAI from 'openai'
import { createError, defineEventHandler } from 'h3'
import { z } from 'zod'

/**
 * POST /api/translate-recipe — convertit un texte de recette en JSON structuré
 * (OpenAI, admin uniquement). Body : `{ recipeText, translateToFrench? }`.
 * NB : le passage au AI SDK est prévu en phase 3 ; ici seulement validation
 * du body et gestion d'erreur centralisée.
 */

const translateBodySchema = z.object({
  recipeText: z.string({ required_error: 'requis', invalid_type_error: 'doit être du texte' })
    .trim()
    .min(1, 'requis')
    .max(20000, 'trop long (max 20000 caractères)'),
  translateToFrench: z.boolean({ invalid_type_error: 'doit être vrai ou faux' }).optional()
})

/** Champs utiles d'une erreur OpenAI (répartis sur plusieurs propriétés selon le cas). */
function describeOpenAiError(error: unknown): { code?: string, type?: string, status?: number } {
  if (typeof error !== 'object' || error === null) return {}
  const e = error as { code?: unknown, type?: unknown, status?: unknown, error?: { code?: unknown, type?: unknown } }
  const pick = (v: unknown) => (typeof v === 'string' ? v : undefined)
  return {
    code: pick(e.code) ?? pick(e.error?.code),
    type: pick(e.type) ?? pick(e.error?.type),
    status: typeof e.status === 'number' ? e.status : undefined
  }
}

export default defineEventHandler(async (event) => {
  try {
    // Réservé aux administrateurs (évite l'abus de la facturation OpenAI)
    await requireAdmin(event)

    const { recipeText, translateToFrench = true } = await validateBody(event, translateBodySchema)

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey || apiKey === 'your_openai_api_key_here') {
      // Détail réservé au serveur (handleApiError renvoie le message générique).
      throw new Error('OPENAI_API_KEY non configurée')
    }

    const client = new OpenAI({ apiKey })

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
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Tu es un expert en conversion de recettes en format JSON structuré avec sections. Tu détectes TOUJOURS les sous-sections dans les instructions et ingrédients en cherchant : 1) des sous-titres suivis de ':', 2) des sauts de ligne (lignes vides) suivis d'une ligne qui ressemble à un titre puis plusieurs lignes de contenu. Tu crées une section séparée pour chaque sous-section détectée. ${translateToFrench ? 'Tu traduis toujours le contenu en français.' : 'Tu conserves la langue d\'origine de la recette, sans traduire.'} Tu retournes toujours un JSON valide et bien formaté, sans texte supplémentaire.`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 3000,
      response_format: { type: 'json_object' }
    })

    const translatedRecipe = response.choices[0]?.message?.content

    if (!translatedRecipe) {
      throw new Error('Réponse OpenAI vide')
    }

    try {
      JSON.parse(translatedRecipe)
    } catch {
      throw new Error('Réponse OpenAI : JSON invalide')
    }

    return {
      translatedRecipe,
      success: true
    }
  } catch (error: unknown) {
    // Erreurs OpenAI connues → statuts explicites (messages à nous, sans détail technique).
    const { code, type, status } = describeOpenAiError(error)

    if (code === 'invalid_api_key' || status === 401) {
      console.error('[api] translate-recipe : clé OpenAI invalide', error)
      throw createError({ statusCode: 502, statusMessage: 'Service de traduction indisponible (configuration OpenAI).' })
    }
    if (type === 'insufficient_quota' || code === 'insufficient_quota' || code === 'credit_balance_exhausted' || status === 429) {
      throw createError({ statusCode: 402, statusMessage: 'Quota OpenAI épuisé. Ajoutez des crédits sur votre compte OpenAI puis réessayez.' })
    }
    if (code === 'model_not_found') {
      console.error('[api] translate-recipe : modèle OpenAI introuvable', error)
      throw createError({ statusCode: 502, statusMessage: 'Service de traduction indisponible (modèle OpenAI).' })
    }

    handleApiError(error, 'translate-recipe')
  }
})
