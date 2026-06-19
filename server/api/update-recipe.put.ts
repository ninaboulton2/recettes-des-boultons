import { defineEventHandler, readBody, getQuery, createError } from 'h3'

export default defineEventHandler(async (event) => {
  try {
    const { supabase } = await requireAdmin(event)

    const query = getQuery(event)
    const recipeId = requireUuid(query.id, 'id')
    const body = await readBody(event)
    const { updates } = body

    if (!updates) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Données de mise à jour manquantes'
      })
    }

    // Vérifier d'abord que la recette existe
    const { data: existingRecipe, error: checkError } = await supabase
      .from('recipes')
      .select('id, title')
      .eq('id', recipeId)
      .single()

    if (checkError || !existingRecipe) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Recette non trouvée'
      })
    }

    // Mapper les noms de colonnes JavaScript vers Supabase
    const supabaseUpdates: any = {}
    
    if (updates.title !== undefined) supabaseUpdates.title = updates.title
    if (updates.description !== undefined) supabaseUpdates.description = updates.description
    if (updates.category !== undefined) supabaseUpdates.category = updates.category
    if (updates.ingredients !== undefined) supabaseUpdates.ingredients = updates.ingredients
    if (updates.instructions !== undefined) supabaseUpdates.instructions = updates.instructions
    if (updates.prepTime !== undefined) supabaseUpdates.prep_time = updates.prepTime
    if (updates.cookTime !== undefined) supabaseUpdates.cook_time = updates.cookTime
    if (updates.servings !== undefined) supabaseUpdates.servings = updates.servings
    if (updates.image !== undefined) supabaseUpdates.image = updates.image
    if (updates.tags !== undefined) supabaseUpdates.tags = updates.tags
    if (updates.notes !== undefined) supabaseUpdates.notes = updates.notes
    
    // Toujours mettre à jour la date de modification
    supabaseUpdates.updated_at = new Date().toISOString()

    // Mettre à jour la recette dans Supabase
    const { data, error } = await supabase
      .from('recipes')
      .update(supabaseUpdates)
      .eq('id', recipeId)
      .select()
      .single()

    if (error) {
      console.error('Erreur Supabase lors de la mise à jour:', error)
      throw createError({
        statusCode: 500,
        statusMessage: `Erreur lors de la mise à jour: ${error.message}`
      })
    }

    if (!data) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Recette non trouvée après mise à jour'
      })
    }

    // Gérer les sections si elles sont présentes dans les updates
    let updatedSections = []
    
    if (updates.sections !== undefined && Array.isArray(updates.sections)) {
      console.log('Mise à jour des sections pour la recette', recipeId)
      
      // 1. Récupérer les IDs des sections existantes
      const { data: existingSections, error: fetchSectionsError } = await supabase
        .from('recipe_sections')
        .select('id')
        .eq('recipe_id', recipeId)

      if (fetchSectionsError) {
        console.error('Erreur lors de la récupération des sections existantes:', fetchSectionsError)
        throw createError({
          statusCode: 500,
          statusMessage: `Erreur lors de la récupération des sections existantes: ${fetchSectionsError.message}`
        })
      }

      if (existingSections && existingSections.length > 0) {
        const sectionIds = existingSections.map(s => s.id)
        
        // 2. Supprimer d'abord les ingrédients liés aux sections
        const { error: deleteIngredientsError } = await supabase
          .from('recipe_ingredients')
          .delete()
          .in('section_id', sectionIds)

        if (deleteIngredientsError) {
          console.error('Erreur lors de la suppression des ingrédients:', deleteIngredientsError)
          throw createError({
            statusCode: 500,
            statusMessage: `Erreur lors de la suppression des ingrédients: ${deleteIngredientsError.message}`
          })
        }
        console.log('✅ Ingrédients supprimés')

        // 3. Supprimer les instructions liées aux sections
        const { error: deleteInstructionsError } = await supabase
          .from('instructions')
          .delete()
          .in('section_id', sectionIds)

        if (deleteInstructionsError) {
          console.error('Erreur lors de la suppression des instructions:', deleteInstructionsError)
          throw createError({
            statusCode: 500,
            statusMessage: `Erreur lors de la suppression des instructions: ${deleteInstructionsError.message}`
          })
        }
        console.log('✅ Instructions supprimées')

        // 4. Maintenant on peut supprimer les sections
        const { error: deleteSectionsError } = await supabase
          .from('recipe_sections')
          .delete()
          .eq('recipe_id', recipeId)

        if (deleteSectionsError) {
          console.error('Erreur lors de la suppression des anciennes sections:', deleteSectionsError)
          throw createError({
            statusCode: 500,
            statusMessage: `Erreur lors de la suppression des anciennes sections: ${deleteSectionsError.message}`
          })
        }
        
        console.log('✅ Anciennes sections supprimées')
      }

      // 2. Créer les nouvelles sections
      if (updates.sections.length > 0) {
        console.log(`Création de ${updates.sections.length} nouvelles sections`)
        
        for (let i = 0; i < updates.sections.length; i++) {
          const section = updates.sections[i]
          console.log(`Création de la section ${i + 1}/${updates.sections.length}:`, section.name)
          
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

          updatedSections.push({
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
        
        console.log(`✅ Toutes les sections mises à jour: ${updatedSections.length} sections`)
      }
    } else {
      // Si les sections ne sont pas dans les updates, récupérer les sections existantes
      const { data: existingSections } = await supabase
        .from('recipe_sections')
        .select('*')
        .eq('recipe_id', recipeId)
        .order('order_index')

      if (existingSections && existingSections.length > 0) {
        // Récupérer les ingrédients et instructions pour chaque section
        const sectionsWithData = await Promise.all(
          existingSections.map(async (section) => {
            const { data: ingredients } = await supabase
              .from('recipe_ingredients')
              .select('*')
              .eq('section_id', section.id)
              .order('order_index')

            const { data: instructions } = await supabase
              .from('instructions')
              .select('*')
              .eq('section_id', section.id)
              .order('order_index')

            return {
              id: section.id,
              recipeId: section.recipe_id,
              name: section.name,
              type: section.type,
              orderIndex: section.order_index,
              ingredients: ingredients?.map(ing => ({
                id: ing.id,
                name: ing.name,
                amount: ing.amount,
                unit: ing.unit,
                optional: ing.optional,
                sectionId: ing.section_id,
                orderIndex: ing.order_index
              })) || [],
              instructions: instructions?.map(inst => ({
                id: inst.id,
                content: inst.content,
                orderIndex: inst.order_index,
                sectionId: inst.section_id
              })) || [],
              createdAt: section.created_at,
              updatedAt: section.updated_at
            }
          })
        )

        updatedSections = sectionsWithData
      }
    }

    // Formater la réponse pour correspondre au format JavaScript
    const formattedRecipe = {
      id: data.id,
      title: data.title,
      description: data.description,
      category: data.category,
      ingredients: data.ingredients, // Garder pour compatibilité
      instructions: data.instructions, // Garder pour compatibilité
      sections: updatedSections,
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
      message: `Recette "${data.title}" mise à jour avec succès`
    }

  } catch (error: any) {
    console.error('Erreur lors de la mise à jour de la recette:', error)
    
    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: `Erreur interne du serveur: ${error.message || 'Erreur inconnue'}`
    })
  }
}) 