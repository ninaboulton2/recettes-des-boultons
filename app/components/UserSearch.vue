<template>
  <div class="space-y-3" data-testid="user-search">
    <div class="space-y-1.5">
      <label :for="inputId" class="block text-sm font-medium text-default">{{ label }}</label>
      <UInput
        :id="inputId"
        v-model="query"
        :placeholder="$t('userSearch.placeholder')"
        icon="i-lucide-search"
        maxlength="60"
        class="w-full"
        autocomplete="off"
        aria-describedby="user-search-hint"
        data-testid="user-search-input"
      />
      <p id="user-search-hint" class="text-sm text-muted">{{ $t('userSearch.hint') }}</p>
    </div>

    <p v-if="error" class="text-sm text-error" role="alert" data-testid="user-search-error">{{ error }}</p>
    <p v-else-if="searched && results.length === 0 && !loading" class="text-sm text-muted" data-testid="user-search-empty">{{ $t('userSearch.empty') }}</p>

    <ul v-if="results.length > 0" class="divide-y divide-default rounded-lg border border-default" data-testid="user-search-results">
      <li v-for="user in results" :key="user.id" class="flex flex-wrap items-center gap-3 p-3" data-testid="user-search-result">
        <UIcon name="i-lucide-user" class="size-5 shrink-0 text-dimmed" aria-hidden="true" />
        <NuxtLink :to="localePath(`/personnes/${user.id}`)" class="min-w-0 flex-1 truncate font-medium text-highlighted hover:text-primary">
          {{ user.displayName ?? $t('prompts.someone') }}
        </NuxtLink>
        <slot name="action" :user="user" />
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { canSearchUsers } from '#shared/utils/socialUi'

/**
 * Recherche de personnes par pseudonyme (`search_users`, 0019) : au moins 3 lettres, personnes « découvrables » seulement,
 * jamais d'e-mail. Le parent fournit l'action de chaque résultat (« Demander en ami », « Inviter »…) par la fente `action`.
 */
defineProps<{ label: string }>()

const { t } = useI18n()
const localePath = useLocalePath()
const { searchUsers } = useFriends()
const { errorText } = useSocialError()
const inputId = `user-search-${useId()}`

const query = ref('')
const results = ref<Array<{ id: string, displayName: string | null }>>([])
const loading = ref(false)
const searched = ref(false)
const error = ref<string | null>(null)

let timer: ReturnType<typeof setTimeout> | undefined
let ticket = 0
watch(query, (value) => {
  clearTimeout(timer)
  if (!canSearchUsers(value)) {
    ticket++
    results.value = []
    searched.value = false
    error.value = null
    return
  }
  timer = setTimeout(() => { void run(value) }, 300)
})
onBeforeUnmount(() => clearTimeout(timer))

async function run(value: string): Promise<void> {
  const mine = ++ticket
  loading.value = true
  error.value = null
  try {
    const found = await searchUsers({ query: value })
    if (mine !== ticket) return
    results.value = found
    searched.value = true
  } catch (cause) {
    if (mine !== ticket) return
    results.value = []
    error.value = errorText(cause) || t('errors.generic')
  } finally {
    if (mine === ticket) loading.value = false
  }
}
</script>
