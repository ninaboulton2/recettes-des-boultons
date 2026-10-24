import { inviteLinkErrorMessage, socialErrorMessage } from '#shared/utils/socialUi'

/** Messages d'erreur traduits des actions sociales (amis, groupes, notifications) : jamais le texte technique de la base. */
export function useSocialError() {
  const { t } = useI18n()
  const render = ({ key, params }: { key: string, params?: Record<string, number> }): string =>
    params?.n !== undefined ? t(key, params, params.n) : t(key)
  return {
    errorText: (cause: unknown): string => render(socialErrorMessage(cause)),
    inviteLinkErrorText: (cause: unknown): string => render(inviteLinkErrorMessage(cause))
  }
}
