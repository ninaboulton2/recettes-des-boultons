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
