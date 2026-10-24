import { expect, test } from '@playwright/test'

/** Sans l'interrupteur v2, les pages de la phase 6E n'existent pas (la v1 est strictement inchangée). */
test('(v1) pages légales, « Compte supprimé » et écran support : 404', async ({ request }) => {
  for (const path of ['/mentions-legales', '/confidentialite', '/conditions', '/cookies', '/compte-supprime', '/support/signalements']) {
    const response = await request.get(path)
    expect(response.status(), path).toBe(404)
  }
})
