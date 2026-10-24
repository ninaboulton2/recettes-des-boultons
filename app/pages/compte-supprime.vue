<template>
  <div class="mx-auto max-w-md" data-testid="account-deleted">
    <EmptyState icon="i-lucide-circle-check" :title="$t('accountDeleted.title')" :message="$t('accountDeleted.message')">
      <template #action>
        <UButton :to="localePath('/')" :label="$t('accountDeleted.home')" data-testid="account-deleted-home" />
      </template>
    </EmptyState>
  </div>
</template>

<script setup lang="ts">
/** Page affichée après la suppression du compte (v2, publique : la personne est déjà déconnectée). */
definePageMeta({ middleware: 'v2-enabled' })

const { t } = useI18n()
const localePath = useLocalePath()
useHead({ title: () => t('accountDeleted.title'), meta: [{ name: 'robots', content: 'noindex, nofollow' }] })
</script>
