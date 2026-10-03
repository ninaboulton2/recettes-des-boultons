/** Comptes locaux (supabase/local/test_accounts.sql, scripts/ci-seed.sh). */
export const ACCOUNTS = {
  user: { email: 'user@local.test', password: 'password123' },
  admin: { email: 'admin@local.test', password: 'password123' }
} as const

export type AccountRole = keyof typeof ACCOUNTS

/** Sessions enregistrées par e2e/auth.setup.ts. */
export const storageStatePath = (role: AccountRole) => `test-results/.auth/${role}.json`

/** Préfixe de TOUTES les données créées par les tests (nettoyées ensuite). */
export const E2E_PREFIX = 'E2E_'

/** Nom unique par test et par projet (chromium / mobile tournent sur la même base). */
export const e2eName = (label: string, project: string) =>
  `${E2E_PREFIX}${label}_${project}_${Date.now().toString(36)}`
