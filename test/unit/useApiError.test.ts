import { describe, expect, it } from 'vitest'
import { ApiError, apiErrorFromResponse, toUserMessage } from '../../app/composables/useApiError'

const GENERIC = 'Une erreur est survenue, réessayez plus tard.'

describe('toUserMessage', () => {
  it('renvoie le statusMessage du serveur pour un 4xx', () => {
    expect(toUserMessage(new ApiError(400, 'Données invalides : recipe.title : requis'))).toBe('Données invalides : recipe.title : requis')
    expect(toUserMessage(new ApiError(403, 'Accès administrateur requis'))).toBe('Accès administrateur requis')
    expect(toUserMessage({ statusCode: 404, statusMessage: 'Recette introuvable' })).toBe('Recette introuvable')
    expect(toUserMessage({ status: 409, data: { statusMessage: 'Déjà en favori' } })).toBe('Déjà en favori')
  })

  it('masque les 5xx, les erreurs réseau et les objets inconnus derrière le message générique', () => {
    expect(toUserMessage(new ApiError(500, 'relation "x" does not exist'))).toBe(GENERIC)
    expect(toUserMessage({ statusCode: 502, statusMessage: 'Bad Gateway' })).toBe(GENERIC)
    expect(toUserMessage(new TypeError('Failed to fetch'))).toBe('Connexion impossible, vérifiez votre réseau puis réessayez.')
    expect(toUserMessage(undefined)).toBe(GENERIC)
    expect(toUserMessage({})).toBe(GENERIC)
    expect(toUserMessage(new ApiError(400, ''))).toBe(GENERIC)
  })

  it('conserve les messages applicatifs levés par le code client', () => {
    expect(toUserMessage(new Error('Vous devez être connecté pour gérer vos favoris'))).toBe('Vous devez être connecté pour gérer vos favoris')
    expect(toUserMessage('Aucune liste sélectionnée')).toBe('Aucune liste sélectionnée')
  })
})

describe('apiErrorFromResponse', () => {
  it('lit le statusMessage JSON de h3 et expose un message utilisateur', async () => {
    const response = new Response(JSON.stringify({ statusCode: 400, statusMessage: 'Données invalides : name : requis', message: 'Données invalides : name : requis' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
    const error = await apiErrorFromResponse(response)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.statusCode).toBe(400)
    expect(error.message).toBe('Données invalides : name : requis')
  })

  it('tombe sur le message générique pour un 500 ou un corps illisible', async () => {
    const serverError = await apiErrorFromResponse(new Response('{"statusCode":500,"statusMessage":"Une erreur est survenue, réessayez plus tard."}', { status: 500 }))
    expect(serverError.message).toBe(GENERIC)
    const html = await apiErrorFromResponse(new Response('<html>Bad gateway</html>', { status: 502 }))
    expect(html.message).toBe(GENERIC)
    expect(toUserMessage(html)).toBe(GENERIC)
  })
})
