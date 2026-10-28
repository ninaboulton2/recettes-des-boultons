import type { RecipeLang } from '#shared/types'
import { recipeTexts, sourceHash, translationAction, type RecipeTexts, type TranslatableRecipe, type TranslationDraft } from '#shared/utils/translation'

/**
 * Traduction À LA DEMANDE d'une recette partagée (retour de test n° 1, point 3) : logique pure, sans Nuxt ni Supabase (les accès
 * sont des « ports » injectés), donc testable. Le branchement est dans `sharedTranslation.ts`.
 *
 * Règles :
 *  - la recette est traduite vers la langue de la personne qui la lit, une fois : le résultat est écrit en base (une ligne par recette),
 *    toutes les personnes qui la lisent ensuite dans cette langue le voient, sans nouvel appel ;
 *  - le coût de l'appel IA est compté sur l'AUTEUR de la recette (comme à l'enregistrement), jamais sur la personne qui lit ;
 *  - jamais d'erreur pour l'appelant : l'échec (plafond de l'auteur, crédit coupé, fournisseur) devient `unavailable` et la page garde
 *    le texte d'origine ; un échec n'est pas rejoué avant `FAILURE_COOLDOWN_MS` (pas d'appel payant répété à chaque affichage) ;
 *  - deux demandes simultanées pour la même recette et la même langue ne font qu'un appel (`busy` pour la seconde).
 */

export type FailureKind = 'quota' | 'provider' | 'config' | 'ai' | 'save'

export type EnsureOutcome
  = | { status: 'same-language' }
    | { status: 'ready' }
    | { status: 'translated' }
    | { status: 'busy' }
    | { status: 'unavailable', reason: FailureKind | 'no-owner' | 'cooldown' }

/** Pas de nouvel essai avant ce délai après un échec. */
export const FAILURE_COOLDOWN_MS = 10 * 60 * 1000

/** Mémoire (par instance du serveur, au mieux) des traductions en cours et des échecs récents. */
export class TranslationGuard {
  private readonly inFlight = new Set<string>()
  private readonly failedAt = new Map<string, number>()

  constructor(private readonly now: () => number = Date.now, private readonly cooldownMs = FAILURE_COOLDOWN_MS) {}

  /** `started` : à traduire maintenant (appeler `finish` ensuite) ; sinon la raison de ne rien faire. */
  tryStart(key: string): 'started' | 'busy' | 'cooldown' {
    if (this.inFlight.has(key)) return 'busy'
    const failed = this.failedAt.get(key)
    if (failed !== undefined) {
      if (this.now() - failed < this.cooldownMs) return 'cooldown'
      this.failedAt.delete(key)
    }
    this.inFlight.add(key)
    return 'started'
  }

  finish(key: string, ok: boolean): void {
    this.inFlight.delete(key)
    if (ok) this.failedAt.delete(key)
    else this.failedAt.set(key, this.now())
    // Borne la mémoire : on oublie les échecs échus.
    if (this.failedAt.size > 500) {
      for (const [k, at] of this.failedAt) if (this.now() - at >= this.cooldownMs) this.failedAt.delete(k)
    }
  }
}

export interface ExistingTranslation {
  locale: RecipeLang
  sourceHash: string
  stale: boolean
}

export interface RecipeForTranslation {
  lang: RecipeLang
  /** `null` : compte supprimé, personne à qui compter l'appel. */
  ownerId: string | null
  recipe: TranslatableRecipe
}

/** Accès injectés (voir `sharedTranslation.ts` pour les vrais). */
export interface TranslationPorts {
  load: () => Promise<RecipeForTranslation>
  loadExisting: () => Promise<ExistingTranslation | null>
  /** Remet `stale = false` (textes inchangés). Renvoie `false` en cas d'échec. */
  revalidate: (locale: RecipeLang) => Promise<boolean>
  /** Appel IA compté sur `ownerId` ; lève si le service est indisponible ou si le modèle échoue (classé par `classify`). */
  translate: (ownerId: string, texts: RecipeTexts) => Promise<{ sourceLanguage: RecipeLang, translation: TranslationDraft, model: string | null }>
  /** Écrit la traduction (RPC `save_recipe_translation_server`). Renvoie `false` en cas d'échec. */
  save: (lang: RecipeLang, translation: TranslationDraft, hash: string, model: string | null) => Promise<boolean>
  classify: (error: unknown) => FailureKind
}

export async function ensureRecipeTranslation(
  ports: TranslationPorts,
  guard: TranslationGuard,
  input: { recipeId: string, locale: RecipeLang }
): Promise<EnsureOutcome> {
  const source = await ports.load()
  if (source.lang === input.locale) return { status: 'same-language' }

  const texts = recipeTexts(source.recipe)
  const hash = sourceHash(texts)
  const action = translationAction({ recipeLang: source.lang, locale: input.locale, existing: await ports.loadExisting(), hash })
  if (action === 'same-language') return { status: 'same-language' }
  if (action === 'ready') return { status: 'ready' }
  if (action === 'revalidate') {
    return (await ports.revalidate(input.locale)) ? { status: 'ready' } : { status: 'unavailable', reason: 'save' }
  }

  if (source.ownerId === null) return { status: 'unavailable', reason: 'no-owner' }
  const key = `${input.recipeId}:${input.locale}`
  const slot = guard.tryStart(key)
  if (slot === 'busy') return { status: 'busy' }
  if (slot === 'cooldown') return { status: 'unavailable', reason: 'cooldown' }

  let ok = false
  try {
    let result
    try {
      result = await ports.translate(source.ownerId, texts)
    } catch (error: unknown) {
      return { status: 'unavailable', reason: ports.classify(error) }
    }
    if (!(await ports.save(result.sourceLanguage, result.translation, hash, result.model))) {
      return { status: 'unavailable', reason: 'save' }
    }
    ok = true
    return { status: 'translated' }
  } finally {
    guard.finish(key, ok)
  }
}
