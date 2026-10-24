/** Bouton d'une bannière (`PromptBanner.vue`). */
export interface PromptAction {
  key: string
  label: string
  icon?: string
  /** Lien : le bouton navigue. Sinon il émet `action` avec sa clé. */
  to?: string
  loading?: boolean
  /** `false` : bouton discret (contour). */
  primary?: boolean
}
