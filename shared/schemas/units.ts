import { z } from 'zod'

/**
 * Codes canoniques de la table `public.units` (migration 0003_units.sql).
 * L'ordre suit `sort_order`. Toute modification de la table doit être
 * répercutée ici : le test `test/unit/schemas/units.test.ts` compare cette
 * liste au fichier de migration (et à la base locale quand elle est joignable).
 */
export const UNIT_CODES = [
  // masse
  'g', 'kg', 'mg',
  // volume
  'ml', 'cl', 'dl', 'l', 'cas', 'cac', 'verre', 'tasse', 'goutte',
  // comptage
  'piece', 'tranche', 'gousse', 'sachet', 'bouquet', 'feuille', 'boite', 'pot',
  'cube', 'botte', 'brin', 'branche', 'tige', 'zeste', 'poignee', 'paquet',
  'bouteille', 'tube', 'tete', 'dosette', 'portion', 'morceau',
  // autre
  'pincee', 'qs', 'cm'
] as const

export const unitCodeSchema = z.enum(UNIT_CODES)

export type UnitCode = z.infer<typeof unitCodeSchema>

export function isUnitCode(value: unknown): value is UnitCode {
  return unitCodeSchema.safeParse(value).success
}
