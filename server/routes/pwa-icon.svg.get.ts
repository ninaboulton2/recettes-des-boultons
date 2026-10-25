import { createError, defineEventHandler, getQuery, setResponseHeader } from 'h3'
import { iconSvg } from '../utils/manifest'

/**
 * GET /pwa-icon.svg?c=rrggbb[&m=1] — toque blanche sur fond de la couleur du thème (icône du manifeste d'un thème non Boultons).
 * Public (aucune donnée) et cacheable : la couleur est la seule entrée et doit être six chiffres hexadécimaux.
 */
export default defineEventHandler((event) => {
  const query = getQuery(event)
  const svg = iconSvg(query.c, query.m === '1')
  if (!svg) throw createError({ statusCode: 400, statusMessage: 'Couleur invalide' })
  setResponseHeader(event, 'Content-Type', 'image/svg+xml; charset=utf-8')
  setResponseHeader(event, 'Cache-Control', 'public, max-age=86400')
  return svg
})
