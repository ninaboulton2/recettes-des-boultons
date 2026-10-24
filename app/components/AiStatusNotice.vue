<template>
  <UAlert
    v-if="blocked"
    :color="serviceWide ? 'warning' : 'info'"
    variant="subtle"
    :icon="serviceWide ? 'i-lucide-cloud-off' : 'i-lucide-clock'"
    :title="title"
    :description="message"
    :actions="[{ label: $t('ai.manual'), icon: 'i-lucide-pencil', color: 'neutral', variant: 'outline', to: localePath('/recettes') }]"
    role="status"
    data-testid="ai-status-notice"
    :data-reason="status?.reason ?? undefined"
  />
  <p v-else-if="remainingLabel" class="text-xs text-muted" data-testid="ai-remaining">{{ remainingLabel }}</p>
</template>

<script setup lang="ts">
/**
 * Bandeau d'état de l'IA (v2, phase 7) au-dessus du traducteur : service coupé pour tout le monde (crédit ou budget épuisé)
 * OU plafond du jour de ce compte atteint (avec l'heure de remise à zéro). Les boutons IA sont désactivés par le parent via
 * `useAiStatus().blocked`. Rien n'est affiché tant que tout va bien, sauf le nombre d'appels restants.
 */
const localePath = useLocalePath()
const { status, blocked, serviceWide, title, message, remainingLabel } = useAiStatus()
</script>
