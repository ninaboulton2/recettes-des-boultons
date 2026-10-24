<template>
  <article class="mx-auto max-w-3xl space-y-8" :data-testid="`legal-${page}`">
    <header class="space-y-2">
      <h1 class="font-serif text-3xl font-semibold text-highlighted md:text-4xl">{{ doc.title }}</h1>
      <p class="text-muted">{{ doc.intro }}</p>
      <p class="text-xs text-dimmed">{{ texts.updatedLabel }}<time :datetime="LEGAL_UPDATED">{{ updated }}</time></p>
      <nav class="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-sm" :aria-label="$t('legal.nav')">
        <NuxtLink v-for="id in LEGAL_PAGE_IDS" :key="id" :to="localePath(LEGAL_PATHS[id])" class="underline-offset-2 hover:underline" :class="id === page ? 'font-semibold text-primary' : 'text-muted'" :aria-current="id === page ? 'page' : undefined">{{ texts.pages[id].title }}</NuxtLink>
      </nav>
    </header>

    <section v-for="section in doc.sections" :id="section.id" :key="section.id" class="space-y-3" :aria-labelledby="`${section.id}-title`">
      <h2 :id="`${section.id}-title`" class="font-serif text-xl font-semibold text-highlighted">{{ section.title }}</h2>
      <template v-for="(block, index) in section.blocks" :key="index">
        <p v-if="block.type === 'p'" class="leading-7 text-default">{{ block.text }}</p>
        <ul v-else-if="block.type === 'ul'" class="list-disc space-y-2 pl-5 leading-7 text-default">
          <li v-for="item in block.items" :key="item">{{ item }}</li>
        </ul>
        <p v-else-if="block.type === 'contact'" class="leading-7 text-default" data-testid="legal-contact">
          <template v-if="contact">{{ texts.contactLabel }}<a :href="`mailto:${contact}`" class="font-medium text-primary underline underline-offset-2">{{ contact }}</a></template>
          <template v-else>{{ texts.contactFallback }}</template>
        </p>
        <p v-else-if="block.type === 'link'" class="leading-7">
          <a :href="block.href" target="_blank" rel="noopener noreferrer" class="font-medium text-primary underline underline-offset-2">{{ block.label }}</a>
        </p>
      </template>
    </section>
  </article>
</template>

<script setup lang="ts">
import { LEGAL_PAGE_IDS, LEGAL_PATHS, LEGAL_UPDATED, legalTexts, type LegalPageId } from '#shared/legal'

/**
 * Page légale (v2), rendue depuis le contenu structuré de `shared/legal/` dans la langue de l'interface.
 * Le bloc « contact » affiche l'adresse configurée, sinon le texte de repli.
 */
const props = defineProps<{ page: LegalPageId }>()

const { locale } = useI18n()
const localePath = useLocalePath()
const contact = useContactEmail()

const texts = computed(() => legalTexts(locale.value))
const doc = computed(() => texts.value.pages[props.page])
const updated = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'long' }).format(new Date(`${LEGAL_UPDATED}T12:00:00Z`)))

useHead({
  title: () => doc.value.title,
  meta: [{ name: 'description', content: () => doc.value.intro }]
})
</script>
