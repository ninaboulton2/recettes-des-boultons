<template>
  <div>
    <UModal
      :open="show"
      :title="recipe ? $t('editor.titleEdit') : $t('editor.titleNew')"
      :description="recipe?.title"
      :content="{ onInteractOutside: keepOpenOnOutsideClick }"
      :ui="{ content: 'sm:max-w-4xl', title: 'font-serif text-xl' }"
      @update:open="onOpenChange"
    >
      <template #body>
        <RecipeEditorForm
          v-if="show"
          ref="form"
          :recipe="recipe"
          @saved="onSaved"
          @cancel="requestClose"
        />
      </template>
    </UModal>

    <!-- Confirmation de sortie (modifications non enregistrées) ; Échap = continuer l'édition. -->
    <UModal
      :open="confirmOpen"
      :title="$t('editor.leave.title')"
      :description="$t('editor.leave.message')"
      :content="{ onOpenAutoFocus: focusStayButton }"
      :ui="{ footer: 'justify-end' }"
      @update:open="value => !value && stayEditing()"
    >
      <template #footer>
        <UButton ref="stayButton" :label="$t('editor.leave.stay')" color="neutral" variant="outline" @click="stayEditing" />
        <UButton :label="$t('editor.leave.confirm')" color="error" @click="leave" />
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { Recipe } from '#shared/types'
import RecipeEditorForm from './editor/RecipeEditorForm.vue'

/**
 * Façade de l'éditeur de recette : même API qu'avant la refonte
 * (`show` / `recipe` → `close` / `save`) pour les pages qui l'utilisent
 * (`pages/recettes/index.vue`, `pages/recettes/[id].vue`). Le formulaire
 * lui-même vit dans `editor/RecipeEditorForm.vue` et est recréé à chaque
 * ouverture (état vierge).
 */
const props = withDefaults(defineProps<{
  show?: boolean
  /** Recette complète (avec sections) à modifier ; `null` pour une création. */
  recipe?: Recipe | null
}>(), {
  show: false,
  recipe: null
})

const emit = defineEmits<{
  close: []
  save: [recipe: Recipe]
}>()

const router = useRouter()
const form = ref<{ isDirty: boolean } | null>(null)
const confirmOpen = ref(false)
const stayButton = ref<{ $el: HTMLElement } | null>(null)
/** Destination d'une navigation interceptée, rejouée si l'utilisateur quitte. */
let pendingRoute: string | null = null

const isDirty = () => props.show && form.value?.isDirty === true

/** Fermeture demandée (Échap, croix, Annuler) : confirmation si des modifications seraient perdues. */
const requestClose = () => {
  if (isDirty()) confirmOpen.value = true
  else emit('close')
}

const stayEditing = () => {
  confirmOpen.value = false
  pendingRoute = null
}

const leave = () => {
  confirmOpen.value = false
  emit('close')
  const target = pendingRoute
  pendingRoute = null
  if (target) void nextTick(() => router.push(target))
}

/** Le focus initial va sur « Continuer l'édition » (choix sûr), pas sur le bouton destructif. */
const focusStayButton = (event: Event) => {
  event.preventDefault()
  stayButton.value?.$el.focus()
}

/** Un clic à côté de la modale ne la ferme pas (saisie en cours protégée) ; Échap, si (avec confirmation si besoin). */
const keepOpenOnOutsideClick = (event: Event) => {
  event.preventDefault()
}

const onOpenChange = (open: boolean) => {
  if (!open) requestClose()
}

// Navigation vers une autre page pendant l'édition.
onBeforeRouteLeave((to) => {
  if (!isDirty()) return true
  pendingRoute = to.fullPath
  confirmOpen.value = true
  return false
})

// Fermeture / rechargement de l'onglet.
const warnBeforeUnload = (event: BeforeUnloadEvent) => {
  if (!isDirty()) return
  event.preventDefault()
  event.returnValue = ''
}
onMounted(() => window.addEventListener('beforeunload', warnBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', warnBeforeUnload))

const onSaved = (recipe: Recipe) => {
  emit('save', recipe)
  emit('close')
}
</script>
