<template>
  <UModal
    :open="isOpen"
    :title="mode === 'login' ? $t('auth.login.title') : $t('auth.signup.title')"
    :description="mode === 'login' ? $t('auth.login.description') : $t('auth.signup.description')"
    @update:open="onUpdateOpen"
  >
    <template #body>
      <div class="space-y-5">
        <AuthProviderButtons />

        <USeparator v-if="hasProviders" :label="$t('auth.oauth.or')" />

        <!-- Connexion -->
        <UForm v-if="mode === 'login'" :schema="loginSchema" :state="login" class="space-y-4" @submit="onLogin">
          <UFormField :label="$t('auth.login.email')" name="email" required>
            <UInput v-model="login.email" type="email" autocomplete="email" icon="i-lucide-mail" class="w-full" />
          </UFormField>

          <UFormField :label="$t('auth.login.password')" name="password" required>
            <UInput v-model="login.password" :type="showPassword ? 'text' : 'password'" autocomplete="current-password" icon="i-lucide-key-round" class="w-full" :ui="{ trailing: 'pe-1' }">
              <template #trailing>
                <UButton
                  color="neutral"
                  variant="link"
                  size="sm"
                  :icon="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                  :aria-label="showPassword ? $t('auth.password.hide') : $t('auth.password.show')"
                  :aria-pressed="showPassword"
                  @click="showPassword = !showPassword"
                />
              </template>
            </UInput>
          </UFormField>

          <div class="flex justify-end">
            <UButton variant="link" size="sm" :label="$t('auth.login.forgot')" :loading="resetting" @click="onForgotPassword" />
          </div>

          <UAlert v-if="error" color="error" variant="soft" icon="i-lucide-circle-alert" :description="error" />
          <UAlert v-if="info" color="success" variant="soft" icon="i-lucide-circle-check" :description="info" />

          <UButton type="submit" block size="lg" :loading="submitting" :label="$t('auth.login.submit')" />
        </UForm>

        <!-- Inscription -->
        <UForm v-else :schema="signupSchema" :state="signup" class="space-y-4" @submit="onSignup">
          <UFormField :label="$t('auth.signup.name')" name="name" required>
            <UInput v-model="signup.name" autocomplete="name" icon="i-lucide-user" class="w-full" />
          </UFormField>

          <UFormField :label="$t('auth.signup.email')" name="email" required>
            <UInput v-model="signup.email" type="email" autocomplete="email" icon="i-lucide-mail" class="w-full" />
          </UFormField>

          <UFormField :label="$t('auth.signup.password')" name="password" required :hint="$t('auth.signup.passwordHint')">
            <UInput v-model="signup.password" :type="showPassword ? 'text' : 'password'" autocomplete="new-password" icon="i-lucide-key-round" class="w-full" :ui="{ trailing: 'pe-1' }">
              <template #trailing>
                <UButton
                  color="neutral"
                  variant="link"
                  size="sm"
                  :icon="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                  :aria-label="showPassword ? $t('auth.password.hide') : $t('auth.password.show')"
                  :aria-pressed="showPassword"
                  @click="showPassword = !showPassword"
                />
              </template>
            </UInput>
          </UFormField>

          <UFormField :label="$t('auth.signup.confirmPassword')" name="confirmPassword" required>
            <UInput v-model="signup.confirmPassword" :type="showPassword ? 'text' : 'password'" autocomplete="new-password" icon="i-lucide-key-round" class="w-full" />
          </UFormField>

          <UAlert v-if="error" color="error" variant="soft" icon="i-lucide-circle-alert" :description="error" />
          <UAlert v-if="info" color="success" variant="soft" icon="i-lucide-circle-check" :description="info" />

          <UButton type="submit" block size="lg" :loading="submitting" :label="$t('auth.signup.submit')" />
        </UForm>
      </div>
    </template>

    <template #footer>
      <p class="w-full text-center text-sm text-muted">
        <template v-if="mode === 'login'">
          {{ $t('auth.login.noAccount') }}
          <UButton variant="link" size="sm" class="px-1" :label="$t('auth.signup.submit')" @click="switchMode('signup')" />
        </template>
        <template v-else>
          {{ $t('auth.signup.hasAccount') }}
          <UButton variant="link" size="sm" class="px-1" :label="$t('auth.login.submit')" @click="switchMode('login')" />
        </template>
      </p>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

/**
 * Modale d'authentification unique : connexion, inscription et OAuth.
 * API conservée pour les pages : prop `isOpen`, émet `close` et `success`.
 */
const props = defineProps<{ isOpen: boolean }>()
const emit = defineEmits<{ close: [], success: [] }>()

const { t } = useI18n()
const authStore = useAuthStore()
const supabase = useSupabaseClient()
const hasProviders = useAuthProviders().length > 0

const mode = ref<'login' | 'signup'>('login')
const showPassword = ref(false)
const submitting = ref(false)
const resetting = ref(false)
const error = ref('')
const info = ref('')

const loginSchema = computed(() => z.object({
  email: z.string().email(t('auth.validation.email')),
  password: z.string().min(1, t('auth.validation.required'))
}))

const signupSchema = computed(() => z.object({
  name: z.string().trim().min(1, t('auth.validation.required')),
  email: z.string().email(t('auth.validation.email')),
  password: z.string().min(6, t('auth.signup.passwordTooShort')),
  confirmPassword: z.string()
}).refine(data => data.password === data.confirmPassword, {
  message: t('auth.signup.passwordMismatch'),
  path: ['confirmPassword']
}))

type LoginSchema = z.output<typeof loginSchema.value>
type SignupSchema = z.output<typeof signupSchema.value>

const login = reactive<LoginSchema>({ email: '', password: '' })
const signup = reactive<SignupSchema>({ name: '', email: '', password: '', confirmPassword: '' })

const reset = () => {
  Object.assign(login, { email: '', password: '' })
  Object.assign(signup, { name: '', email: '', password: '', confirmPassword: '' })
  error.value = ''
  info.value = ''
  showPassword.value = false
}

const switchMode = (next: 'login' | 'signup') => {
  mode.value = next
  error.value = ''
  info.value = ''
}

const close = () => {
  emit('close')
  reset()
}

const onUpdateOpen = (open: boolean) => {
  if (!open) close()
}

const onLogin = async (event: FormSubmitEvent<LoginSchema>) => {
  submitting.value = true
  error.value = ''
  try {
    const result = await authStore.login(event.data)
    if (result.success) {
      emit('success')
      close()
    } else {
      error.value = result.error || t('auth.login.error')
    }
  } catch {
    error.value = t('auth.login.error')
  } finally {
    submitting.value = false
  }
}

const onForgotPassword = async () => {
  if (!login.email) {
    error.value = t('auth.login.emailFirst')
    return
  }
  resetting.value = true
  error.value = ''
  info.value = ''
  try {
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(login.email, {
      redirectTo: `${window.location.origin}/reset-password`
    })
    if (resetError) error.value = resetError.message || t('auth.login.resetError')
    else info.value = t('auth.login.resetSent')
  } catch {
    error.value = t('auth.login.resetError')
  } finally {
    resetting.value = false
  }
}

const onSignup = async (event: FormSubmitEvent<SignupSchema>) => {
  submitting.value = true
  error.value = ''
  info.value = ''
  try {
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: event.data.email,
      password: event.data.password,
      options: { data: { name: event.data.name, role: 'user' } }
    })
    if (signUpError) {
      error.value = signUpError.message || t('auth.signup.error')
    } else if (data.session) {
      // Confirmation d'e-mail désactivée → connexion immédiate
      await authStore.checkAuth()
      emit('success')
      close()
    } else if (data.user) {
      info.value = t('auth.signup.checkEmail')
    } else {
      error.value = t('auth.signup.error')
    }
  } catch {
    error.value = t('auth.signup.error')
  } finally {
    submitting.value = false
  }
}

// Toujours rouvrir sur la connexion, formulaire vierge
watch(() => props.isOpen, (open) => {
  if (open) {
    mode.value = 'login'
    reset()
  }
})
</script>
