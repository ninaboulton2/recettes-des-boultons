<template>
  <div class="space-y-16 md:space-y-24" data-testid="home-visitor">
    <!-- Héros : produit neutre (la marque d'un groupe vient de son thème, jamais de la page d'accueil visiteur) -->
    <section class="flex flex-col items-start gap-6 pt-6 md:pt-12">
      <h1 class="max-w-3xl font-serif text-4xl font-semibold leading-tight text-highlighted sm:text-5xl md:text-6xl">
        {{ $t('visitor.title') }}
      </h1>
      <p class="max-w-xl text-lg text-muted md:text-xl">{{ $t('visitor.subtitle') }}</p>
      <div class="flex flex-wrap gap-3">
        <UButton size="xl" icon="i-lucide-user-plus" :label="$t('visitor.signup')" data-testid="visitor-signup" @click="open('signup')" />
        <UButton size="xl" color="neutral" variant="outline" icon="i-lucide-log-in" :label="$t('visitor.login')" data-testid="visitor-login" @click="open('login')" />
      </div>
      <p class="text-sm text-muted">{{ $t(googleAuth ? 'visitor.freeGoogle' : 'visitor.free') }}</p>
    </section>

    <section aria-labelledby="visitor-features-title" class="border-t border-default pt-12 md:pt-16">
      <h2 id="visitor-features-title" class="mb-6 font-serif text-2xl font-semibold text-highlighted md:mb-8 md:text-3xl">{{ $t('visitor.features.title') }}</h2>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div v-for="feature in FEATURES" :key="feature.key" class="rounded-xl border border-default p-5" :data-testid="`visitor-feature-${feature.key}`">
          <div class="mb-4 flex size-10 items-center justify-center rounded-lg bg-primary/10">
            <UIcon :name="feature.icon" class="size-5 text-primary" aria-hidden="true" />
          </div>
          <h3 class="font-semibold text-highlighted">{{ $t(`visitor.features.${feature.key}.title`) }}</h3>
          <p class="mt-1 text-sm text-muted">{{ $t(`visitor.features.${feature.key}.description`) }}</p>
        </div>
      </div>
    </section>

    <AuthModal :is-open="authOpen" :initial-mode="authMode" @close="authOpen = false" @success="authOpen = false" />
  </div>
</template>

<script setup lang="ts">
/**
 * Accueil d'un visiteur sans compte (v2) : présentation générique du produit et deux boutons (créer un compte, se connecter).
 * Aucune recette n'est lue ni affichée, aucune marque d'un groupe : le thème par défaut s'applique.
 */
const FEATURES = [
  { key: 'cookbook', icon: 'i-lucide-book-open' },
  { key: 'sharing', icon: 'i-lucide-users' },
  { key: 'ai', icon: 'i-lucide-sparkles' },
  { key: 'bilingual', icon: 'i-lucide-languages' }
] as const

const googleAuth = useGoogleAuth()
const authOpen = ref(false)
const authMode = ref<'login' | 'signup'>('login')
function open(mode: 'login' | 'signup'): void {
  authMode.value = mode
  authOpen.value = true
}
</script>
