/**
 * Détection des durées dans le texte d'une étape (FR + EN), pour le minuteur du
 * mode cuisine. Fonctions pures, sans dépendance.
 *
 * Reconnu : « 10 minutes », « 10 min », « 10 mn », « 1 h 30 », « 1h30 »,
 * « 1 heure », « 45 secondes », « 2 hours », « 1 hr 15 min », « 1 heure et demie »,
 * « une demi-heure », « un quart d'heure », « dix minutes », « 1,5 heure »,
 * et les fourchettes « 10 à 12 minutes », « 10-12 min », « 10 to 12 minutes »
 * (borne basse retenue pour le minuteur, fourchette conservée dans le libellé).
 *
 * Ignoré : températures (« 180 °C »), quantités (« 2 œufs », « 30 g »), nombres
 * d'étapes. Une unité n'est reconnue que collée à un nombre (ou un nombre écrit
 * en toutes lettres) et jamais suivie d'une lettre : « 2 h » oui, « 2 hachis » non.
 *
 * Limites assumées : les minutes sans unité ne sont lues qu'après des heures
 * (« 1h30 », « 1 heure 30 »), pas après des minutes (« 2 min 30 » donne 2 min) ;
 * les jours ne sont pas gérés.
 */

export interface StepDuration {
  /** Durée du minuteur en secondes (borne basse d'une fourchette). */
  seconds: number
  /** Borne haute d'une fourchette (« 10 à 12 minutes »), sinon `null`. */
  maxSeconds: number | null
  /** Libellé court, identique en FR et EN : « 12 min », « 10–12 min », « 1 h 30 », « 45 s ». */
  label: string
  /** Extrait du texte d'où la durée a été lue. */
  text: string
}

const MAX_SECONDS = 72 * 3600

const NUM = String.raw`\d+\/\d+|\d*[½¼¾]|\d+(?:[.,]\d+)?`
const NUM_WORDS = String.raw`une?|an?|one|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|quinze|vingt|trente|quarante-cinq|quarante|two|three|four|five|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty-five|forty`
const QTY = `(?:${NUM}|${NUM_WORDS})`
const UNIT = String.raw`heures?|hours?|hrs?|h|minutes?|mins?|mns?|secondes?|seconds?|secs?|s`
// Tiret collé aux nombres, tiret long avec ou sans espaces, ou mot (« à », « to »…) entouré d'espaces.
const RANGE_SEP = String.raw`(?:-|\s*[–—]\s*|\s+(?:à|to|ou|or)\s+)`
const SPECIAL = String.raw`demi[- ]heure|half[- ](?:an[- ])?hour|quart d['’]heure|(?:a\s+)?quarter(?:[- ]of[- ]an)?[- ]hour`

// Pas de lookbehind (Safari < 16.4 refuserait de charger le module) : le caractère
// qui précède est capturé (groupe 1) et décompté de la position.
const DURATION_RE = new RegExp(
  `(^|[^\\p{L}\\d])(?:(?:(?<lo>${QTY})\\s*${RANGE_SEP})?(?<num>${QTY})\\s*(?<unit>${UNIT})(?![\\p{L}'’])|(?<special>${SPECIAL})(?![\\p{L}]))`,
  'giu'
)

// Minutes écrites avec unité après des heures : « 1 h 30 min », « 1 heure et 15 minutes ».
const MINUTES_AFTER_HOURS = /^\s*(?:et\s+|and\s+|,\s*)?(\d{1,2})\s*(?:minutes?|mins?|mns?)(?![\p{L}'’])/iu
// Minutes sans unité après des heures : « 1h30 », « 1 heure 30 » (2 chiffres, pas suivis d'une quantité).
const BARE_MINUTES_AFTER_HOURS = /^\s*(?:et\s+)?(0[5-9]|[1-5]\d)(?!\d|[.,]\d|\s*(?:°|º|%|deg|c\.|cuill|tasse|cup|tbsp|tsp|(?:kg|mg|g|ml|cl|dl|l|cm|mm|oz|lb)(?![\p{L}])))/iu
const HALF_OR_QUARTER_AFTER_HOURS = /^\s*(et\s+demie?|et\s+quart|and\s+a\s+half)(?![\p{L}])/iu
const SECONDS_AFTER_MINUTES = /^\s*(?:et\s+|and\s+)?(\d{1,2})\s*(?:secondes?|seconds?|secs?|s)(?![\p{L}'’])/iu

const WORD_VALUES: Record<string, number> = {
  un: 1, une: 1, a: 1, an: 1, one: 1,
  deux: 2, two: 2, trois: 3, three: 3, quatre: 4, four: 4, cinq: 5, five: 5, six: 6,
  sept: 7, seven: 7, huit: 8, eight: 8, neuf: 9, nine: 9, dix: 10, ten: 10,
  onze: 11, eleven: 11, douze: 12, twelve: 12, quinze: 15, fifteen: 15,
  vingt: 20, twenty: 20, trente: 30, thirty: 30, quarante: 40, forty: 40,
  'quarante-cinq': 45, 'forty-five': 45
}
const FRACTIONS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75 }

function toNumber(raw: string): number {
  const value = raw.toLowerCase()
  const word = WORD_VALUES[value]
  if (word !== undefined) return word
  const fractionChar = value.slice(-1)
  const fraction = FRACTIONS[fractionChar]
  if (fraction !== undefined) return Number(value.slice(0, -1) || 0) + fraction
  if (value.includes('/')) {
    const [top, bottom] = value.split('/').map(Number)
    return top !== undefined && bottom ? top / bottom : 0
  }
  return Number(value.replace(',', '.'))
}

type UnitKind = 'h' | 'min' | 's'

function unitKind(unit: string): UnitKind {
  const value = unit.toLowerCase()
  if (value.startsWith('h')) return 'h'
  if (value.startsWith('m')) return 'min'
  return 's'
}

const UNIT_SECONDS: Record<UnitKind, number> = { h: 3600, min: 60, s: 1 }

function specialSeconds(raw: string): number {
  return /quart|quarter/i.test(raw) ? 900 : 1800
}

/** « 90 » → « 1 min 30 s », « 5400 » → « 1 h 30 », « 45 » → « 45 s ». */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds))
  if (seconds < 60) return `${seconds} s`
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60)
    const rest = seconds % 60
    return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`
  }
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return minutes === 0 ? `${hours} h` : `${hours} h ${String(minutes).padStart(2, '0')}`
}

function formatRange(low: number, high: number): string {
  const wholeMinutes = (value: number) => value % 60 === 0 && value < 3600
  const wholeHours = (value: number) => value % 3600 === 0
  if (wholeMinutes(low) && wholeMinutes(high)) return `${low / 60}–${high / 60} min`
  if (wholeHours(low) && wholeHours(high)) return `${low / 3600}–${high / 3600} h`
  return `${formatDuration(low)}–${formatDuration(high)}`
}

/** Compte à rebours : « 08:42 », « 1:05:00 ». */
export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(totalSeconds))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${pad(minutes)}:${pad(rest)}`
}

/** Toutes les durées d'un texte, dans l'ordre de lecture, sans doublon. */
export function parseDurations(text: string | null | undefined): StepDuration[] {
  if (!text) return []
  const source = text.replace(/[  ]/g, ' ')
  const found: StepDuration[] = []
  for (const match of source.matchAll(DURATION_RE)) {
    const groups = match.groups ?? {}
    const start = (match.index ?? 0) + (match[1]?.length ?? 0)
    let end = (match.index ?? 0) + match[0].length
    let seconds: number
    let upper: number | null = null

    if (groups.special) {
      seconds = specialSeconds(groups.special)
    } else {
      const raw = groups.num ?? ''
      const kind = unitKind(groups.unit ?? '')
      // « a second » / « une seconde couche » : ordinal ou adjectif, pas une durée.
      if (kind === 's' && /^(?:un|une|an?)$/i.test(raw)) continue
      seconds = toNumber(raw) * UNIT_SECONDS[kind]
      if (groups.lo) {
        const low = toNumber(groups.lo) * UNIT_SECONDS[kind]
        upper = Math.max(low, seconds)
        seconds = Math.min(low, seconds)
      } else {
        const rest = source.slice(end)
        if (kind === 'h') {
          const minutes = MINUTES_AFTER_HOURS.exec(rest) ?? BARE_MINUTES_AFTER_HOURS.exec(rest)
          const half = minutes ? null : HALF_OR_QUARTER_AFTER_HOURS.exec(rest)
          if (minutes) {
            seconds += Number(minutes[1]) * 60
            end += minutes[0].length
          } else if (half) {
            seconds += /quart/i.test(half[1] ?? '') ? 900 : 1800
            end += half[0].length
          }
        } else if (kind === 'min') {
          const extra = SECONDS_AFTER_MINUTES.exec(rest)
          if (extra) {
            seconds += Number(extra[1])
            end += extra[0].length
          }
        }
      }
    }

    seconds = Math.round(seconds)
    if (upper !== null) upper = Math.round(upper)
    if (!Number.isFinite(seconds) || seconds < 1 || (upper ?? seconds) > MAX_SECONDS) continue
    if (upper !== null && upper === seconds) upper = null
    if (found.some(duration => duration.seconds === seconds && duration.maxSeconds === upper)) continue
    found.push({
      seconds,
      maxSeconds: upper,
      label: upper === null ? formatDuration(seconds) : formatRange(seconds, upper),
      text: source.slice(start, end).trim()
    })
  }
  return found
}

/** Première durée d'un texte, ou `null` si l'étape n'en contient pas. */
export function parseDuration(text: string | null | undefined): StepDuration | null {
  return parseDurations(text)[0] ?? null
}
