import type { PendingPrompt } from '#shared/utils/cookbook'
import { useCookbook } from './useCookbook'

/**
 * Bannières de la page d'accueil connectée (v2) : `pending_prompts` (0021) — « Explorer les recettes de X »
 * (`author_recipes`) et « nouvelle recette » (`new_recipe`). Calculées à la volée par la base ; fermées pour de bon
 * par `dismiss_prompt`. Chargées côté navigateur seulement (ne bloquent pas le rendu).
 */
export function usePendingPrompts() {
  const cookbook = useCookbook()
  const { data, refresh, status } = useAsyncData<PendingPrompt[]>('pending-prompts', () => cookbook.pendingPrompts(), {
    server: false,
    lazy: true,
    default: () => []
  })

  const prompts = computed(() => data.value ?? [])

  /** Ferme la bannière (retirée tout de suite de l'écran, puis confirmée par la base). */
  async function dismiss(prompt: PendingPrompt): Promise<void> {
    const before = data.value ?? []
    data.value = before.filter(item => !(item.kind === prompt.kind && item.targetId === prompt.targetId))
    try {
      await cookbook.dismissPrompt({ kind: prompt.kind, targetId: prompt.targetId })
    } catch (error) {
      data.value = before
      throw error
    }
  }

  /** Ajoute une nouvelle recette au carnet : la bannière disparaît (la base ne la calcule plus). */
  async function addRecipe(prompt: PendingPrompt): Promise<void> {
    if (!prompt.recipeId) return
    await cookbook.addToCookbook({ recipeId: prompt.recipeId })
    useRecipesStore().refresh()   // mon carnet (liste, compteurs de catégories) se recharge
    await refresh()
  }

  return { prompts, status, refresh, dismiss, addRecipe }
}
