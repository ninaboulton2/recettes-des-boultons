/**
 * Semaine du planning : lundi → dimanche, clés `YYYY-MM-DD`.
 * Même convention que les pages (`toISOString().slice(0, 10)`).
 */

/** Clé de jour `YYYY-MM-DD` utilisée par `planning.date_string`. */
export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** Lundi de la semaine contenant `date` (même calcul que les grilles du planning). */
export function startOfWeek(date: Date): Date {
  const start = new Date(date)
  start.setDate(start.getDate() - start.getDay() + 1)
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
