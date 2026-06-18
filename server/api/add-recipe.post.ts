import { defineEventHandler, readBody, createError } from 'h3'

export default defineEventHandler(async (event) => {
  try {
    const { supabase } = await requireAdmin(event)

    const body = await readBody(event)
    const { recipe } = body

    if (!recipe) {
      throw createError({
        statusCode: 400,
        statusMessage: 'La recette est requise'
      })
    }

    // Mapper les noms de colonnes JavaScript vers Supabase
    const supabaseRecipe = {
      title: recipe.title,
      description: recipe.description,
      category: recipe.category,
      ingredients: recipe.ingredients,
      instructions: recipe.instructions,
      prep_time: recipe.prepTime,
      cook_time: recipe.cookTime,
      servings: recipe.servings,
      image: recipe.image,
      tags: recipe.tags || [],
      notes: recipe.notes || "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    // Insérer la recette dans Supabase
    const { data, error } = await supabase
      .from('recipes')
      .insert(supabaseRecipe)
      .select()
      .single()

    if (error) {
      console.error('Erreur Supabase:', error)
      throw createError({
        statusCode: 500,
        statusMessage: `Erreur lors de l'insertion en base de données: ${error.message}`
      })
    }

    const recipeId = data.id
    const createdSections = []

    // Créer les sections si elles existent
    console.log('Vérification des sections:', recipe.sections)
    if (recipe.sections && Array.isArray(recipe.sections) && recipe.sections.length > 0) {
      console.log(`Création de ${recipe.sections.length} sections pour la recette ${recipeId}`)
      
      for (let i = 0; i < recipe.sections.length; i++) {
        const section = recipe.sections[i]
        console.log(`Création de la section ${i + 1}/${recipe.sections.length}:`, section.name)
        
        // Créer la section
        const { data: sectionData, error: sectionError } = await supabase
          .from('recipe_sections')
          .insert({
            recipe_id: recipeId,
            name: section.name,
            type: section.type || 'mixed',
            order_index: section.orderIndex || 0
          })
          .select()
          .single()

        if (sectionError) {
          console.error('❌ Erreur lors de la création de la section:', sectionError)
          console.error('Détails de la section:', section)
          // Ne pas continuer silencieusement - lancer une erreur
          throw createError({
            statusCode: 500,
            statusMessage: `Erreur lors de la création de la section "${section.name}": ${sectionError.message}`
          })
        }
        
        console.log('✅ Section créée:', sectionData.id)

        const sectionId = sectionData.id
        const createdIngredients = []
        const createdInstructions = []

        // Créer les ingrédients de la section
        if (section.ingredients && Array.isArray(section.ingredients)) {
          console.log(`  Création de ${section.ingredients.length} ingrédients pour la section ${section.name}`)
          
          for (let j = 0; j < section.ingredients.length; j++) {
            const ingredient = section.ingredients[j]
            const { data: ingredientData, error: ingredientError } = await supabase
              .from('recipe_ingredients')
              .insert({
                recipe_id: recipeId,
                section_id: sectionId,
                name: ingredient.name,
                amount: ingredient.amount || null,
                unit: ingredient.unit || null,
                optional: ingredient.optional || false,
                order_index: ingredient.orderIndex || 0
              })
              .select()
              .single()

            if (ingredientError) {
              console.error(`  ❌ Erreur lors de la création de l'ingrédient ${j + 1}:`, ingredientError)
              console.error('  Détails de l\'ingrédient:', ingredient)
              // Ne pas continuer silencieusement - lancer une erreur
              throw createError({
                statusCode: 500,
                statusMessage: `Erreur lors de la création de l'ingrédient "${ingredient.name}": ${ingredientError.message}`
              })
            }
            
            console.log(`  ✅ Ingrédient créé: ${ingredient.name}`)

            createdIngredients.push({
              id: ingredientData.id,
              name: ingredientData.name,
              amount: ingredientData.amount,
              unit: ingredientData.unit,
              optional: ingredientData.optional,
              sectionId: ingredientData.section_id,
              orderIndex: ingredientData.order_index
            })
          }
        }

        // Créer les instructions de la section
        if (section.instructions && Array.isArray(section.instructions)) {
          console.log(`  Création de ${section.instructions.length} instructions pour la section ${section.name}`)
          
          for (let k = 0; k < section.instructions.length; k++) {
            const instruction = section.instructions[k]
            const { data: instructionData, error: instructionError } = await supabase
              .from('instructions')
              .insert({
                recipe_id: recipeId,
                section_id: sectionId,
                content: instruction.content,
                order_index: instruction.orderIndex || 0
              })
              .select()
              .single()

            if (instructionError) {
              console.error(`  ❌ Erreur lors de la création de l'instruction ${k + 1}:`, instructionError)
              console.error('  Détails de l\'instruction:', instruction)
              // Ne pas continuer silencieusement - lancer une erreur
              throw createError({
                statusCode: 500,
                statusMessage: `Erreur lors de la création de l'instruction: ${instructionError.message}`
              })
            }
            
            console.log(`  ✅ Instruction créée: ${instruction.content.substring(0, 50)}...`)

            createdInstructions.push({
              id: instructionData.id,
              content: instructionData.content,
              orderIndex: instructionData.order_index,
              sectionId: instructionData.section_id
            })
          }
        }

        createdSections.push({
          id: sectionId,
          recipeId: recipeId,
          name: sectionData.name,
          type: sectionData.type,
          orderIndex: sectionData.order_index,
          ingredients: createdIngredients,
          instructions: createdInstructions,
          createdAt: sectionData.created_at,
          updatedAt: sectionData.updated_at
        })
        
        console.log(`✅ Section "${section.name}" complétée avec ${createdIngredients.length} ingrédients et ${createdInstructions.length} instructions`)
      }
      
      console.log(`✅ Toutes les sections créées: ${createdSections.length} sections`)
    } else {
      console.log('⚠️ Aucune section à créer (sections vides ou absentes)')
    }

    // Formater la réponse pour correspondre au format JavaScript
    const formattedRecipe = {
      id: data.id,
      title: data.title,
      description: data.description,
      category: data.category,
      ingredients: data.ingredients, // Garder pour compatibilité
      instructions: data.instructions, // Garder pour compatibilité
      sections: createdSections,
      prepTime: data.prep_time,
      cookTime: data.cook_time,
      servings: data.servings,
      image: data.image,
      tags: data.tags || [],
      notes: data.notes || "",
      createdAt: data.created_at,
      updatedAt: data.updated_at
    }

    return {
      success: true,
      recipe: formattedRecipe,
      message: `Recette "${recipe.title}" ajoutée`
    }

  } catch (error: any) {
    console.error('Erreur lors de l\'ajout de la recette:', error)
    
    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: `Erreur interne du serveur: ${error.message || 'Erreur inconnue'}`
    })
  }
}) 