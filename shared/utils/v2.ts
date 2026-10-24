/**
 * Interrupteur v2 : `runtimeConfig.public.v2`, variable `NUXT_PUBLIC_V2=true`.
 *
 * Absent ou autre que « true » (ou `1`) : l'application est strictement celle de la v1
 * (aucune requête v2, aucune page v2, thème figé par `NUXT_PUBLIC_EDITION`).
 * Présent : navigation v2, accueil en 3 écrans, thèmes par personne ou groupe, catégories personnelles.
 * Choix : une variable plutôt qu'une détection des RPC (une détection coûterait une requête par rendu
 * serveur et donnerait une interface différente selon l'état de la base, difficile à raisonner).
 */
export function isV2Enabled(value: unknown): boolean {
  if (value === true) return true
  if (typeof value === 'string') return ['true', '1'].includes(value.trim().toLowerCase())
  return false
}

/**
 * Qui peut écrire des recettes et appeler l'IA (routes serveur `add-recipe`, `update-recipe`, `delete-recipe`, extraction,
 * transcription, traduction, doublons) : `'admin'` en v1, `'user'` (tout compte connecté ; le RLS et les RPC décident ensuite
 * pour chaque recette) quand l'interrupteur v2 est allumé. Isolée de `server/utils/auth.ts` pour être testée sans Nuxt.
 */
export function recipeWriterRequirement(v2Flag: unknown): 'admin' | 'user' {
  return isV2Enabled(v2Flag) ? 'user' : 'admin'
}
