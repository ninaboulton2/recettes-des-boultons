<template>
  <nav class="flex items-center justify-between gap-2 rounded-xl border border-default bg-default p-2 print:hidden" :aria-label="$t('planning.title')">
    <UButton
      icon="i-lucide-chevron-left"
      color="neutral"
      variant="ghost"
      size="lg"
      :aria-label="$t('planning.navigation.previous')"
      @click="emit('previous')"
    />

    <div class="flex min-w-0 flex-col items-center gap-1 text-center">
      <p class="truncate font-sans text-sm font-semibold text-highlighted sm:text-base">
        {{ label }}
      </p>
      <UButton
        v-if="!isCurrentWeek"
        :label="$t('planning.navigation.today')"
        icon="i-lucide-calendar-check"
        color="primary"
        variant="soft"
        size="xs"
        @click="emit('today')"
      />
    </div>

    <UButton
      icon="i-lucide-chevron-right"
      color="neutral"
      variant="ghost"
      size="lg"
      :aria-label="$t('planning.navigation.next')"
      @click="emit('next')"
    />
  </nav>
</template>

<script setup lang="ts">
/** Navigation de semaine : précédente / suivante / retour à aujourd'hui. */
defineProps<{
  /** Libellé de la semaine affichée (ex. « 5 – 11 octobre 2026 »). */
  label: string
  /** Masque le bouton « aujourd'hui » quand la semaine courante est déjà affichée. */
  isCurrentWeek: boolean
}>()

const emit = defineEmits<{
  previous: []
  next: []
  today: []
}>()
</script>
