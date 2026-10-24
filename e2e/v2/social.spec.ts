import { expect, test } from '@playwright/test'
import { gotoApp, waitForHydration } from '../support/app'
import {
  E2E_6B, E2E_6C, V2_ACCOUNTS, V2_PASSWORD, cleanup6B, cleanup6C, createGroupWith, createRecipe, loginV2, prepareAmi,
  restoreAmi, signedIn, sqlLocal, switchTo
} from './support'

/**
 * Social v2 (phase 6C) : amis (demande, acceptation par l'autre compte, retrait, refus, relance trop tôt, limite de débit,
 * introuvable), profil d'une personne, groupes (création, invitation, acceptation, bannière « Explorer », lien d'invitation,
 * transfert du rôle de créateur, retrait, quitter avec perte d'accès, suppression), notifications (reçues, ouvertes, tout
 * marquer comme lu, « Voir plus »), rangement d'une recette ajoutée dans une catégorie. Plusieurs personnes : le même onglet
 * passe d'un compte à l'autre (`switchTo`). Chaque test repart d'un social vide (`cleanup6C`).
 */
let amiId = ''
let adminId = ''
let userId = ''

test.beforeAll(async () => {
  cleanup6C()
  await cleanup6B()
  amiId = await prepareAmi()
  adminId = (await signedIn('admin')).userId
  userId = (await signedIn('user')).userId
})
test.beforeEach(() => { cleanup6C() })

/** Remet admin@ et user@ sur le thème du groupe « Les Boultons » (état de la base v2 locale) : un test change leur thème actif. */
const restoreBoultonsTheme = () => sqlLocal(`update public.profiles set active_theme_group_id = (select id from public.groups where name = 'Les Boultons') where id in ('${adminId}', '${userId}')`)
test.afterAll(async () => {
  cleanup6C()
  restoreBoultonsTheme()
  await cleanup6B()
  await restoreAmi()
})

// ----------------------------------------------------------------------------------------------------------- amis

test('(6c-friends1) demande d’ami, acceptation par l’autre compte, profil, retrait confirmé (Échap ferme)', async ({ page }) => {
  await loginV2(page, 'admin')
  await gotoApp(page, '/amis')
  await page.getByTestId('user-search-input').fill('Ami E2E')
  const result = page.getByTestId('user-search-result').filter({ hasText: 'Ami E2E' })
  await result.getByTestId('friend-ask').click()
  await expect(result.getByTestId('search-status')).toHaveText('Demande envoyée')
  await expect(page.getByTestId('friend-request-out')).toContainText('Ami E2E')

  // L'autre compte : la cloche compte 1 notification, la demande est là, on accepte
  await switchTo(page, 'ami')
  await expect(page.getByTestId('notification-bell')).toHaveAttribute('aria-label', /1 non lue/)
  await gotoApp(page, '/amis')
  const incoming = page.getByTestId('friend-request-in').filter({ hasText: 'Admin' })
  await expect(incoming).toBeVisible()
  await incoming.getByTestId('friend-accept').click()
  await expect(page.getByTestId('friend-row').filter({ hasText: 'Admin' })).toBeVisible()
  await expect(page.getByTestId('friends-incoming')).toHaveCount(0)

  // Retour sur le premier compte : ami(e), profil, lien « Ses recettes », retrait
  await switchTo(page, 'admin')
  await gotoApp(page, '/amis')
  const row = page.getByTestId('friend-row').filter({ hasText: 'Ami E2E' })
  await expect(row).toBeVisible()
  await expect(page.getByTestId('friend-request-out')).toHaveCount(0)
  await row.getByTestId('friend-profile-link').click()
  await expect(page).toHaveURL(new RegExp(`/personnes/${amiId}`))
  await expect(page.getByTestId('person-name')).toHaveText('Ami E2E')
  await expect(page.getByTestId('person-friend-status')).toHaveText('Vous êtes amis.')
  await expect(page.getByTestId('person-recipes-link')).toHaveAttribute('href', new RegExp(`/explorer/${amiId}$`))

  await page.getByTestId('person-remove').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Retirer Ami E2E de vos amis ?')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page.getByTestId('person-friend-status')).toHaveText('Vous êtes amis.')
  await page.getByTestId('person-remove').click()
  await page.getByTestId('confirm-ok').click()
  // Sans amitié ni groupe en commun, la personne n'est plus visible : retour à la liste (vide)
  await expect(page).toHaveURL(/\/amis$/)
  await expect(page.getByTestId('friends-empty')).toBeVisible()
  await gotoApp(page, `/personnes/${amiId}`)
  await expect(page.getByTestId('person-not-found')).toBeVisible()
})

test('(6c-friends2) demande refusée : état visible, relance trop tôt expliquée, annulation d’une demande', async ({ page }) => {
  const admin = await signedIn('admin')
  const ami = await signedIn('ami')
  const sent = await admin.client.rpc('send_friend_request', { p_user: amiId })
  expect(sent.error).toBeNull()
  const declined = await ami.client.rpc('respond_friend_request', { p_id: sent.data as string, p_accept: false })
  expect(declined.error).toBeNull()

  await loginV2(page, 'admin')
  await gotoApp(page, '/amis')
  const request = page.getByTestId('friend-request-out').filter({ hasText: 'Ami E2E' })
  await expect(request.getByTestId('request-state')).toContainText('Demande refusée. Vous pourrez la renouveler à partir du')
  await expect(request.getByTestId('friend-resend')).toBeDisabled()

  // Par la recherche, le bouton reste actif : la base refuse (7 jours) et l'interface explique en clair
  await page.getByTestId('user-search-input').fill('Ami E2E')
  await page.getByTestId('user-search-result').filter({ hasText: 'Ami E2E' }).getByTestId('friend-ask').click()
  await expect(page.getByTestId('friends-error')).toContainText('Cette personne a refusé votre demande récemment. Vous pourrez la renouveler dans 7 jours.')

  // Annuler une demande en attente : l'autre personne la reçoit, puis elle disparaît
  cleanup6C()
  const again = await admin.client.rpc('send_friend_request', { p_user: amiId })
  expect(again.error).toBeNull()
  await gotoApp(page, '/amis')
  const pending = page.getByTestId('friend-request-out').filter({ hasText: 'Ami E2E' })
  await expect(pending.getByTestId('request-state')).toHaveText('En attente d’une réponse')
  await pending.getByTestId('friend-cancel').click()
  await expect(page.getByTestId('friends-outgoing')).toHaveCount(0)
  const left = await ami.client.rpc('list_friend_requests')
  expect(left.data).toEqual([])
})

test('(6c-friends3) limite de débit, personne introuvable, lien erroné', async ({ page }) => {
  sqlLocal(`insert into private.rate_events (user_id, kind) select '${adminId}', 'friend_request' from generate_series(1, 20)`)
  await loginV2(page, 'admin')
  await gotoApp(page, '/amis')
  await page.getByTestId('user-search-input').fill('Ami E2E')
  await page.getByTestId('user-search-result').filter({ hasText: 'Ami E2E' }).getByTestId('friend-ask').click()
  await expect(page.getByTestId('friends-error')).toContainText('Trop de demandes aujourd’hui (la limite est de 20 par jour)')

  // Aucune personne trouvée
  await page.getByTestId('user-search-input').fill('zzzzzz')
  await expect(page.getByTestId('user-search-empty')).toContainText('Aucune personne trouvée')

  // Personne introuvable : même page neutre pour un identifiant inconnu ou mal formé
  await gotoApp(page, '/personnes/00000000-0000-4000-8000-00000000dead')
  await expect(page.getByTestId('person-not-found')).toBeVisible()
  await gotoApp(page, '/personnes/pas-un-identifiant')
  await expect(page.getByTestId('person-not-found')).toBeVisible()
})

// --------------------------------------------------------------------------------------------------------- groupes

test('(6c-groups1) créer un groupe, inviter, accepter : rien dans le carnet, puis la bannière « Explorer »', async ({ page }) => {
  const admin = await signedIn('admin')
  const recipeId = await createRecipe(admin.client, `${E2E_6B}Gratin 6C`, 'groups')
  const groupName = `${E2E_6C}Voisins`

  await loginV2(page, 'admin')
  await gotoApp(page, '/groupes')
  await page.getByTestId('group-create-name').fill(groupName)
  await page.getByTestId('group-create-submit').click()
  await expect(page).toHaveURL(/\/groupes\/[0-9a-f-]{36}$/)
  await expect(page.getByTestId('group-name')).toHaveText(groupName)
  await expect(page.getByTestId('group-role')).toHaveText('Créateur')
  await expect(page.getByTestId('group-member')).toHaveCount(1)

  // Inviter par la recherche, puis annuler et ré-inviter
  await page.getByTestId('user-search-input').fill('Ami E2E')
  const result = page.getByTestId('user-search-result').filter({ hasText: 'Ami E2E' })
  await result.getByTestId('invite-search-send').click()
  await expect(page.getByTestId('invite-pending')).toContainText('Ami E2E')
  await page.getByTestId('invite-cancel').click()
  await expect(page.getByTestId('invite-pending')).toHaveCount(0)
  await result.getByTestId('invite-search-send').click()
  await expect(page.getByTestId('invite-pending')).toContainText('Ami E2E')

  // L'invité : notification, invitation, on le dit clairement : rien n'est ajouté
  await switchTo(page, 'ami')
  await expect(page.getByTestId('notification-bell')).toHaveAttribute('aria-label', /1 non lue/)
  await gotoApp(page, '/groupes')
  const invitation = page.getByTestId('group-invitation').filter({ hasText: groupName })
  await expect(invitation).toBeVisible()
  await expect(page.getByTestId('groups-invitations')).toContainText('ne met aucune recette dans votre carnet')
  await invitation.getByTestId('group-invitation-accept').click()
  await expect(page.getByTestId('groups-joined')).toContainText('Rien n’a été ajouté à votre carnet')
  await expect(page.getByTestId('group-card').filter({ hasText: groupName })).toBeVisible()
  const banner = page.getByTestId('prompt-banner').filter({ hasText: 'Explorer les recettes de Admin' })
  await expect(banner).toBeVisible()

  // Le carnet est resté vide, mais la recette est lisible et explorable
  const ami = await signedIn('ami')
  const entries = await ami.client.from('cookbook_entries').select('recipe_id')
  expect(entries.data).toEqual([])
  await banner.getByRole('link', { name: 'Explorer', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/explorer/${adminId}`))
  await expect(page.getByTestId('explore-grid')).toContainText(`${E2E_6B}Gratin 6C`)
  await page.getByTestId('explore-profile-link').click()
  await expect(page).toHaveURL(new RegExp(`/personnes/${adminId}`))
  await expect(page.getByTestId('person-groups')).toContainText(groupName)
  expect(recipeId).toBeTruthy()

  // Page du groupe : membres avec liens vers leurs profils ; un membre ne gère rien
  await gotoApp(page, '/groupes')
  await page.getByTestId('group-card').filter({ hasText: groupName }).click()
  await expect(page.getByTestId('group-member')).toHaveCount(2)
  await expect(page.getByTestId('group-role')).toHaveText('Membre')
  await expect(page.getByTestId('group-member').filter({ hasText: 'Admin' }).getByTestId('member-link')).toHaveAttribute('href', new RegExp(`/personnes/${adminId}$`))
  for (const id of ['group-invite', 'group-link', 'group-delete', 'member-remove', 'member-transfer', 'group-rename-input']) {
    await expect(page.getByTestId(id)).toHaveCount(0)
  }
  await expect(page.getByTestId('group-leave')).toBeVisible()
})

test('(6c-groups2) lien d’invitation : jeton montré une fois, usage par un autre compte, lien invalide neutre', async ({ page }) => {
  const groupId = await createGroupWith('admin', `${E2E_6C}Lien`)
  await loginV2(page, 'admin')
  await gotoApp(page, `/groupes/${groupId}`)
  await expect(page.getByTestId('group-link')).toContainText('valable 7 jours')
  await page.getByTestId('link-create').click()
  const created = page.getByTestId('link-created')
  await expect(created).toContainText('il n’est montré qu’une seule fois')
  await expect(created).toContainText('Valable jusqu’au')
  const url = await created.getByTestId('link-url').inputValue()
  expect(url).toMatch(/\/rejoindre\/[0-9a-f]{64}$/)
  await expect(page.getByTestId('link-pending')).toHaveCount(1)
  // Le jeton n'est plus affiché après rechargement (seule l'empreinte est stockée) ; le lien en attente reste annulable
  await page.reload()
  await waitForHydration(page)
  await expect(page.getByTestId('link-created')).toHaveCount(0)
  await expect(page.getByTestId('link-pending')).toHaveCount(1)

  // Visiteur : connexion demandée, puis « Rejoindre »
  await logoutV2Page(page)
  await page.goto(new URL(url).pathname)
  await waitForHydration(page)
  await page.getByTestId('join-login').click()
  const dialog = page.getByRole('dialog', { name: 'Connexion' })
  await dialog.getByRole('textbox', { name: 'Email' }).fill(V2_ACCOUNTS.ami)
  await dialog.getByRole('textbox', { name: 'Mot de passe' }).fill(V2_PASSWORD)
  await dialog.getByRole('button', { name: 'Se connecter' }).click()
  await expect(dialog).toBeHidden()
  await page.getByTestId('join-button').click()
  await expect(page).toHaveURL(new RegExp(`/groupes/${groupId}$`))
  await expect(page.getByTestId('group-name')).toHaveText(`${E2E_6C}Lien`)
  await expect(page.getByTestId('group-member')).toHaveCount(2)

  // Lien à usage unique : un troisième compte reçoit le même message neutre qu'un lien inconnu
  await switchTo(page, 'user')
  await page.goto(new URL(url).pathname)
  await waitForHydration(page)
  await page.getByTestId('join-button').click()
  const used = await page.getByTestId('join-invalid').innerText()
  expect(used).toContain('invalide, expiré ou déjà utilisé')
  await page.goto(`/rejoindre/${'0'.repeat(64)}`)
  await waitForHydration(page)
  await page.getByTestId('join-button').click()
  await expect(page.getByTestId('join-invalid')).toHaveText(used)
  await page.goto('/rejoindre/pas-un-jeton')
  await waitForHydration(page)
  await expect(page.getByTestId('join-invalid')).toHaveText(used)
})

test('(6c-groups3) transfert du rôle de créateur (confirmation, explication, Échap), puis nouveaux droits', async ({ page }) => {
  const groupId = await createGroupWith('admin', `${E2E_6C}Transfert`, ['ami'])
  await loginV2(page, 'admin')
  await gotoApp(page, `/groupes/${groupId}`)
  await page.getByTestId('group-member').filter({ hasText: 'Ami E2E' }).getByTestId('member-transfer').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Passer le rôle de créateur à Ami E2E ?')
  await expect(dialog).toContainText('Vous resterez simple membre')
  await expect(dialog).toContainText('Cette action ne se défait pas')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page.getByTestId('group-role')).toHaveText('Créateur')

  await page.getByTestId('group-member').filter({ hasText: 'Ami E2E' }).getByTestId('member-transfer').click()
  await page.getByTestId('confirm-ok').click()
  await expect(page.getByTestId('group-role')).toHaveText('Membre')
  await expect(page.getByTestId('group-delete')).toHaveCount(0)
  await expect(page.getByTestId('group-leave')).toBeVisible()

  await switchTo(page, 'ami')
  // L'invitation (acceptée par l'API pour préparer le groupe) et le transfert : deux notifications non lues
  await expect(page.getByTestId('notification-bell')).toHaveAttribute('aria-label', /2 non lues/)
  await gotoApp(page, '/notifications')
  await expect(page.getByTestId('notification-text').first()).toContainText(`Admin vous a confié la gestion du groupe « ${E2E_6C}Transfert ».`)
  await gotoApp(page, `/groupes/${groupId}`)
  await expect(page.getByTestId('group-role')).toHaveText('Créateur')
  await expect(page.getByTestId('group-delete')).toBeVisible()
  await expect(page.getByTestId('group-invite')).toBeVisible()
})

test('(6c-groups4) renommer, retirer un membre (confirmé), supprimer le groupe : « les recettes restent »', async ({ page }) => {
  const admin = await signedIn('admin')
  const recipeId = await createRecipe(admin.client, `${E2E_6B}Reste 6C`, 'groups')
  const groupId = await createGroupWith('admin', `${E2E_6C}Fin`, ['ami'])
  await loginV2(page, 'admin')
  await gotoApp(page, `/groupes/${groupId}`)

  await page.getByTestId('group-rename-input').fill(`${E2E_6C}Fin renommé`)
  await page.getByTestId('group-rename-submit').click()
  await expect(page.getByTestId('group-name')).toHaveText(`${E2E_6C}Fin renommé`)

  await page.getByTestId('group-member').filter({ hasText: 'Ami E2E' }).getByTestId('member-remove').click()
  await expect(page.getByRole('dialog')).toContainText('Retirer Ami E2E du groupe ?')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page.getByTestId('group-member')).toHaveCount(2)
  await page.getByTestId('group-member').filter({ hasText: 'Ami E2E' }).getByTestId('member-remove').click()
  await page.getByTestId('confirm-ok').click()
  await expect(page.getByTestId('group-member')).toHaveCount(1)

  await page.getByTestId('group-delete').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Les recettes restent à leurs auteurs')
  await expect(dialog).toContainText('seuls les accès donnés au groupe disparaissent')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await page.getByTestId('group-delete').click()
  await page.getByTestId('confirm-ok').click()
  await expect(page).toHaveURL(/\/groupes$/)
  await expect(page.getByTestId('group-card').filter({ hasText: E2E_6C })).toHaveCount(0)

  const still = await admin.client.from('recipes').select('id').eq('id', recipeId)
  expect(still.data).toHaveLength(1)

  // La personne retirée a été prévenue (et le groupe supprimé aussi : elle n'en faisait plus partie, donc un seul message)
  await switchTo(page, 'ami')
  await gotoApp(page, '/notifications')
  await expect(page.getByTestId('notification-text').filter({ hasText: 'Vous avez été retiré du groupe' })).toBeVisible()
})

test('(6c-groups5) quitter un groupe : l’accès aux recettes du groupe disparaît', async ({ page }) => {
  const admin = await signedIn('admin')
  const recipeId = await createRecipe(admin.client, `${E2E_6B}Quitter 6C`, 'groups')
  const groupId = await createGroupWith('admin', `${E2E_6C}Quitter`, ['ami'])

  const ami = await signedIn('ami')
  const before = await ami.client.from('recipes').select('id').eq('id', recipeId)
  expect(before.data).toHaveLength(1)

  await loginV2(page, 'ami')
  await gotoApp(page, `/recettes/${recipeId}`)
  await expect(page.getByRole('heading', { name: `${E2E_6B}Quitter 6C` })).toBeVisible()

  await gotoApp(page, `/groupes/${groupId}`)
  await page.getByTestId('group-leave').click()
  await expect(page.getByRole('dialog')).toContainText(`Quitter « ${E2E_6C}Quitter » ?`)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  await page.getByTestId('group-leave').click()
  await page.getByTestId('confirm-ok').click()
  await expect(page).toHaveURL(/\/groupes$/)
  await expect(page.getByTestId('groups-empty')).toBeVisible()

  const after = await ami.client.from('recipes').select('id').eq('id', recipeId)
  expect(after.data).toEqual([])
  await gotoApp(page, `/recettes/${recipeId}`)
  await expect(page.getByText('Recette introuvable').first()).toBeVisible()
  // Le groupe est maintenant « introuvable » pour cette personne
  await gotoApp(page, `/groupes/${groupId}`)
  await expect(page.getByTestId('group-not-found')).toBeVisible()
})

test('(6c-groups6) thème du groupe : aperçu, enregistrement, « Utiliser le thème de ce groupe » puis retour à mon thème', async ({ page }) => {
  const groupId = await createGroupWith('admin', `${E2E_6C}Thème`, ['ami'])
  await loginV2(page, 'admin')
  await gotoApp(page, `/groupes/${groupId}`)
  const primary = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ui-primary').trim())
  const mine = await primary()
  await page.getByTestId('theme-preset-olive').click()
  await expect.poll(primary).not.toBe(mine)   // aperçu en direct, avant d'enregistrer
  const preview = await primary()
  await page.getByTestId('group-theme-save').click()
  await expect(page.getByTestId('group-theme-use')).toBeEnabled()
  await page.getByTestId('group-theme-use').click()
  await expect(page.getByTestId('group-theme-active')).toBeVisible()
  await expect.poll(primary).toBe(preview)
  const active = preview
  await page.reload()
  await waitForHydration(page)
  expect(await primary()).toBe(active)
  await page.getByTestId('group-theme-mine').click()
  await expect(page.getByTestId('group-theme-use')).toBeVisible()
  await expect.poll(primary).not.toBe(active)   // retour au thème personnel (admin utilisait celui des Boultons au départ)

  // Un membre voit le thème du groupe mais ne peut pas le modifier
  await switchTo(page, 'ami')
  await gotoApp(page, `/groupes/${groupId}`)
  await expect(page.getByTestId('group-theme-save')).toHaveCount(0)
  await expect(page.getByTestId('group-theme-use')).toBeEnabled()
})

// -------------------------------------------------------------------------------------------------- notifications

test('(6c-notifs1) notifications reçues, ouverture d’une notification, « Tout marquer comme lu », cloche à jour', async ({ page }) => {
  const admin = await signedIn('admin')
  const ami = await signedIn('ami')
  const recipeId = await createRecipe(admin.client, `${E2E_6B}Tarte 6C`, 'private')

  const sent = await admin.client.rpc('send_friend_request', { p_user: amiId })
  expect(sent.error).toBeNull()
  expect((await ami.client.rpc('respond_friend_request', { p_id: sent.data as string, p_accept: true })).error).toBeNull()
  await createGroupWith('admin', `${E2E_6C}Notif`)
  const group = await admin.client.rpc('list_my_groups')
  const groupId = (group.data as Array<{ group_id: string, name: string }>).find(g => g.name === `${E2E_6C}Notif`)!.group_id
  expect((await admin.client.rpc('invite_to_group', { p_group: groupId, p_user: amiId })).error).toBeNull()
  expect((await admin.client.rpc('grant_recipe', { p_recipe: recipeId, p_grantee_user: amiId, p_permission: 'read' })).error).toBeNull()

  await loginV2(page, 'ami')
  const bell = page.getByTestId('notification-bell')
  await expect(bell).toHaveAttribute('aria-label', /3 non lues/)
  await gotoApp(page, '/notifications')
  const list = page.getByTestId('notifications-list')
  await expect(list.getByTestId('notification')).toHaveCount(3)
  await expect(list).toContainText('Admin vous demande en ami.')
  await expect(list).toContainText(`Admin vous invite à rejoindre le groupe « ${E2E_6C}Notif ».`)
  await expect(list).toContainText(`Admin a partagé la recette « ${E2E_6B}Tarte 6C » avec vous.`)

  // Ouvrir une notification : la fiche s'ouvre, la notification est lue, la cloche descend à 2
  await list.getByTestId('notification').filter({ hasText: 'a partagé la recette' }).getByTestId('notification-open').click()
  await expect(page).toHaveURL(new RegExp(`/recettes/${recipeId}$`))
  await expect(bell).toHaveAttribute('aria-label', /2 non lues/)
  await page.goBack()
  await waitForHydration(page)
  await expect(page.getByTestId('notification').filter({ hasText: 'a partagé la recette' })).toHaveAttribute('data-read', 'true')

  await page.getByTestId('notifications-mark-all').click()
  await expect(bell).toHaveAttribute('aria-label', 'Notifications')
  await expect(page.getByTestId('notifications-mark-all')).toHaveCount(0)
  for (const item of await page.getByTestId('notification').all()) await expect(item).toHaveAttribute('data-read', 'true')

  // Côté admin : « Ami E2E a accepté votre demande d'ami » mène au profil
  await switchTo(page, 'admin')
  await gotoApp(page, '/notifications')
  await page.getByTestId('notification').filter({ hasText: 'a accepté votre demande d’ami' }).getByTestId('notification-open').click()
  await expect(page).toHaveURL(new RegExp(`/personnes/${amiId}$`))
})

test('(6c-notifs2) pagination « Voir plus », genre inconnu masqué, état vide', async ({ page }) => {
  await loginV2(page, 'user')
  await gotoApp(page, '/notifications')
  await expect(page.getByTestId('notifications-empty')).toBeVisible()

  sqlLocal(`
    insert into public.notifications (user_id, type, payload, created_at)
    select '${userId}', 'group_deleted', jsonb_build_object('group_name', 'G' || n), now() - (n || ' minutes')::interval from generate_series(1, 32) n;
    insert into public.notifications (user_id, type, payload, created_at) values ('${userId}', 'type_du_futur', '{}', now() - interval '1 day');
  `)
  await gotoApp(page, '/notifications')
  await expect(page.getByTestId('notification')).toHaveCount(30)
  await expect(page.getByTestId('notification').first()).toContainText('« G1 »')
  await page.getByTestId('notifications-more').click()
  await expect(page.getByTestId('notification')).toHaveCount(32)
  await expect(page.getByTestId('notifications-more')).toHaveCount(0)
  await expect(page.getByTestId('notifications-list')).not.toContainText('type_du_futur')
  // « Tout marquer comme lu » marque aussi la page non affichée
  await page.getByTestId('notifications-mark-all').click()
  await expect(page.getByTestId('notification-bell')).toHaveAttribute('aria-label', 'Notifications')
})

// ------------------------------------------------------------------------------------------------ rangement

test('(6c-category) ranger une recette ajoutée dans une de mes catégories (fiche et carte), jamais pour mes recettes', async ({ page }) => {
  const admin = await signedIn('admin')
  const recipeId = await createRecipe(admin.client, `${E2E_6B}Salade 6C`, 'groups')
  const user = await signedIn('user')
  expect((await user.client.rpc('add_to_cookbook', { p_recipe: recipeId })).error).toBeNull()
  const categories = await user.client.from('categories').select('id, name_fr').order('sort_order')
  const [first, second] = categories.data as Array<{ id: string, name_fr: string }>
  expect(first && second).toBeTruthy()

  await loginV2(page, 'user')
  await gotoApp(page, `/recettes/${recipeId}`)
  const picker = page.getByTestId('recipe-entry-category').getByTestId('entry-category')
  await expect(picker).toHaveValue('')
  await picker.selectOption({ label: first!.name_fr })
  await expect(picker).toHaveValue(first!.id)
  const entryCategory = async () => (await user.client.from('cookbook_entries').select('category_id').eq('recipe_id', recipeId).single()).data
  await expect.poll(entryCategory).toEqual({ category_id: first!.id })
  await page.reload()
  await waitForHydration(page)
  await expect(page.getByTestId('recipe-entry-category').getByTestId('entry-category')).toHaveValue(first!.id)

  // Depuis la carte du carnet : le choix est repris, on change, le filtre par catégorie suit
  await gotoApp(page, '/recettes')
  const card = page.getByTestId('recipe-grid').locator('article', { hasText: `${E2E_6B}Salade 6C` })
  await expect(card.getByTestId('entry-category')).toHaveValue(first!.id)
  await card.getByTestId('entry-category').selectOption({ label: second!.name_fr })
  await expect(card.getByTestId('entry-category')).toHaveValue(second!.id)
  await expect.poll(entryCategory).toEqual({ category_id: second!.id })
  await gotoApp(page, `/recettes?category=${second!.id}`)
  await expect(page.getByTestId('recipe-grid').locator('article', { hasText: `${E2E_6B}Salade 6C` })).toBeVisible()
  await gotoApp(page, `/recettes?category=${first!.id}`)
  await expect(page.getByTestId('recipe-grid').locator('article', { hasText: `${E2E_6B}Salade 6C` })).toHaveCount(0)

  // « Sans catégorie »
  await gotoApp(page, `/recettes/${recipeId}`)
  await page.getByTestId('recipe-entry-category').getByTestId('entry-category').selectOption({ label: 'Sans catégorie' })
  await expect.poll(entryCategory).toEqual({ category_id: null })

  // La base refuse la catégorie d'une autre personne, et l'auteur n'a pas ce sélecteur (sa catégorie est dans l'éditeur)
  const theirs = await admin.client.from('categories').select('id').limit(1).single()
  const refused = await user.client.from('cookbook_entries').update({ category_id: (theirs.data as { id: string }).id }).eq('recipe_id', recipeId).select('recipe_id')
  expect(refused.error?.code).toBe('42501')
  expect(userId).toBeTruthy()
  await switchTo(page, 'admin')
  await gotoApp(page, `/recettes/${recipeId}`)
  await expect(page.getByTestId('recipe-entry-category')).toHaveCount(0)
  await gotoApp(page, '/recettes')
  await expect(page.getByTestId('entry-category')).toHaveCount(0)
})

// Déconnexion simple (cookies et stockage) sans reconnexion.
async function logoutV2Page(page: import('@playwright/test').Page): Promise<void> {
  await page.context().clearCookies()
  await page.evaluate(() => { try { localStorage.clear() } catch { /* sans stockage */ } })
}
