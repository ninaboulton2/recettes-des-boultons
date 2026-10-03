<template>
  <UApp :locale="uiLocale">
    <div class="flex min-h-screen flex-col items-center justify-center px-4 py-16 text-center">
      <p class="font-serif text-7xl font-semibold text-primary">{{ statusCode }}</p>
      <h1 class="mt-6 font-serif text-2xl font-semibold text-highlighted md:text-3xl">
        {{ statusCode === 404 ? $t('ui.error.notFound.title') : $t('ui.error.server.title') }}
      </h1>
      <p class="mt-3 max-w-md text-muted">
        {{ statusCode === 404 ? $t('ui.error.notFound.description') : $t('ui.error.server.description') }}
      </p>
      <UButton class="mt-8" size="lg" icon="i-lucide-house" :label="$t('ui.common.backHome')" @click="goHome" />
    </div>
  </UApp>
</template>

<script setup lang="ts">
import type { NuxtError } from '#app'
import { en, fr } from '@nuxt/ui/locale'

const props = defineProps<{ error: NuxtError }>()

const { locale } = useI18n()
const uiLocale = computed(() => (locale.value === 'en' ? en : fr))
const statusCode = computed(() => props.error.statusCode ?? 500)

useHead({ title: () => String(statusCode.value) })

const goHome = () => clearError({ redirect: '/' })
</script>
