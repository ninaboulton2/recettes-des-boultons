<template>
  <footer class="mt-auto border-t border-default pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0" data-testid="app-footer">
    <UContainer class="flex flex-col items-center justify-between gap-3 py-5 text-sm text-muted sm:flex-row md:py-6">
      <p>{{ $t('footer.copyright', { year: new Date().getFullYear(), site: siteName }) }}</p>
      <nav :aria-label="$t('legal.footerNav')">
        <ul class="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <li v-for="id in LEGAL_PAGE_IDS" :key="id">
            <NuxtLink :to="localePath(LEGAL_PATHS[id])" class="underline-offset-2 hover:text-default hover:underline" :data-testid="`footer-${id}`">{{ $t(`legal.footer.${id}`) }}</NuxtLink>
          </li>
          <li v-if="contact">
            <a :href="`mailto:${contact}`" class="underline-offset-2 hover:text-default hover:underline" data-testid="footer-contact">{{ $t('legal.footer.contact') }}</a>
          </li>
        </ul>
      </nav>
    </UContainer>
  </footer>
</template>

<script setup lang="ts">
import { LEGAL_PAGE_IDS, LEGAL_PATHS } from '#shared/legal'

/**
 * Pied de page v2 : mentions légales, confidentialité, conditions, cookies, et contact s'il est configuré. Visible aussi sur
 * mobile ; le bas de la page est dégagé de la hauteur de la barre d'onglets fixe (4,5 rem + zone sûre de l'appareil).
 */
const siteName = useSiteName()
const localePath = useLocalePath()
const contact = useContactEmail()
</script>
