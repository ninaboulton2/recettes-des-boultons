<template>
  <div class="mx-auto max-w-md py-8">
    <UCard>
      <template #header>
        <h1 class="font-serif text-2xl font-semibold text-highlighted">{{ $t('auth.reset.title') }}</h1>
      </template>

      <LoadingState v-if="!ready && !linkError" :message="$t('auth.reset.checking')" />

      <div v-else-if="linkError" class="text-center">
        <UAlert color="error" variant="soft" icon="i-lucide-circle-alert" :description="linkError" />
        <UButton class="mt-6" variant="link" :to="localePath('/')" :label="$t('ui.common.backHome')" />
      </div>

      <UForm v-else :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
        <UFormField :label="$t('auth.reset.newPassword')" name="password" required :hint="$t('auth.signup.passwordHint')">
          <UInput v-model="state.password" type="password" autocomplete="new-password" icon="i-lucide-key-round" class="w-full" />
        </UFormField>
        <UFormField :label="$t('auth.signup.confirmPassword')" name="confirmPassword" required>
          <UInput v-model="state.confirmPassword" type="password" autocomplete="new-password" icon="i-lucide-key-round" class="w-full" />
        </UFormField>

        <UAlert v-if="error" color="error" variant="soft" icon="i-lucide-circle-alert" :description="error" />
        <UAlert v-if="success" color="success" variant="soft" icon="i-lucide-circle-check" :description="success" />

        <UButton type="submit" block size="lg" :loading="submitting" :label="$t('auth.reset.submit')" />
      </UForm>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

const { t } = useI18n()
const supabase = useSupabaseClient()
const localePath = useLocalePath()

const ready = ref(false)
const linkError = ref('')
const submitting = ref(false)
const error = ref('')
const success = ref('')

const schema = computed(() => z.object({
  password: z.string().min(6, t('auth.signup.passwordTooShort')),
  confirmPassword: z.string()
}).refine(data => data.password === data.confirmPassword, {
  message: t('auth.signup.passwordMismatch'),
  path: ['confirmPassword']
}))
type Schema = z.output<typeof schema.value>

const state = reactive<Schema>({ password: '', confirmPassword: '' })

onMounted(async () => {
  // Le client Supabase lit le jeton de récupération de l'URL et ouvre une session.
  const { data } = await supabase.auth.getSession()
  if (data.session) {
    ready.value = true
    return
  }
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) ready.value = true
  })
  setTimeout(() => {
    if (!ready.value) linkError.value = t('auth.reset.invalidLink')
  }, 2500)
})

const onSubmit = async (event: FormSubmitEvent<Schema>) => {
  submitting.value = true
  error.value = ''
  success.value = ''
  try {
    const { error: updateError } = await supabase.auth.updateUser({ password: event.data.password })
    if (updateError) {
      error.value = updateError.message || t('auth.reset.error')
      return
    }
    success.value = t('auth.reset.success')
    setTimeout(() => navigateTo(localePath('/')), 1500)
  } catch {
    error.value = t('auth.reset.error')
  } finally {
    submitting.value = false
  }
}

useHead({ title: () => t('auth.reset.title') })
</script>
