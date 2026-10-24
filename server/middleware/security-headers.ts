import { defineEventHandler } from 'h3'
import { applyRouteSecurityHeaders } from '../utils/securityHeaders'

/** En-têtes de sécurité propres à une route (voir `server/utils/securityHeaders.ts`). */
export default defineEventHandler(applyRouteSecurityHeaders)
