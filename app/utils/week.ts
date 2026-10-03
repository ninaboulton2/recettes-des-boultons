/**
 * Semaine du planning : lundi → dimanche, clés `YYYY-MM-DD`.
 *
 * Les clés sont calculées en heure LOCALE (et non via `toISOString`, qui
 * décale la date entre minuit et 2 h en France). Les dates manipulées sont
 * ramenées à midi pour que les changements d'heure n'altèrent pas les calculs.
 */

const DAY_MS = 24 * 60 * 60 * 1000

/** Copie de `date` fixée à 12:00 locale (immunise les calculs contre l'heure d'été). */
function atNoon(date: Date): Date {
  const copy = new Date(date)
  copy.setHours(12, 0, 0, 0)
  return copy
}

/** Clé de jour `YYYY-MM-DD` (heure locale) utilisée par `planning.date_string`. */
export function toDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Date (midi locale) correspondant à une clé `YYYY-MM-DD` ; `null` si la clé est invalide. */
export function fromDateString(dateString: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString)
  if (!match) return null
  const [, y, m, d] = match
  const date = new Date(Number(y), Number(m) - 1, Number(d), 12)
  return toDateString(date) === dateString ? date : null
}

/** Lundi (midi locale) de la semaine contenant `date`. Le dimanche appartient à la semaine qui s'achève. */
export function startOfWeek(date: Date): Date {
  const start = atNoon(date)
  const offset = (start.getDay() + 6) % 7 // lundi = 0 … dimanche = 6
  start.setDate(start.getDate() - offset)
  return start
}

/** Les 7 dates de la semaine contenant `date`, du lundi au dimanche. */
export function weekDates(date: Date): Date[] {
  const start = startOfWeek(date)
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start)
    day.setDate(start.getDate() + index)
    return day
  })
}

/** Bornes `YYYY-MM-DD` (incluses) de la semaine contenant `date`. */
export function weekBounds(date: Date): { from: string, to: string } {
  const days = weekDates(date)
  return { from: toDateString(days[0] ?? date), to: toDateString(days[6] ?? date) }
}

/** Même jour calendaire (heure locale). */
export function isSameDay(a: Date, b: Date): boolean {
  return toDateString(a) === toDateString(b)
}

/** `date` décalée de `weeks` semaines (négatif : en arrière). */
export function shiftWeeks(date: Date, weeks: number): Date {
  const shifted = atNoon(date)
  shifted.setDate(shifted.getDate() + weeks * 7)
  return shifted
}

/** Nombre de jours (entiers) entre deux clés `YYYY-MM-DD` (`to - from`). */
export function daysBetween(from: string, to: string): number {
  const a = fromDateString(from)
  const b = fromDateString(to)
  if (!a || !b) return 0
  return Math.round((b.getTime() - a.getTime()) / DAY_MS)
}
