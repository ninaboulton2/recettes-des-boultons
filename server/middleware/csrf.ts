import { defineEventHandler } from 'h3'
import { csrfGuard } from '../utils/csrf'

/** Refuse les écritures `/api/**` venues d'un autre site (voir `server/utils/csrf.ts`). */
export default defineEventHandler(csrfGuard)
