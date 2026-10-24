import { SHADES, type NeutralColor, type Palette, type Shade } from '../editions/types'
import { contrastRatio } from '../utils/color'

/**
 * Génération d'une palette 50 → 950 à partir d'UNE couleur (`#rrggbb`, la nuance 500), en OKLCH :
 * la teinte est gardée, la clarté va de 0,975 (50) à la clarté de la couleur (500) puis à une
 * valeur sombre (950) ; la saturation suit une courbe en cloche, bornée au gamut sRGB.
 * Le résultat est toujours une chaîne `#rrggbb` : c'est tout ce que le CSS du thème contient.
 */

interface Oklch { L: number, C: number, h: number }

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

export function hexToOklch(hex: string): Oklch {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m?.[1]) throw new Error(`Couleur invalide : ${hex}`)
  const v = m[1]
  const [r, g, b] = [0, 2, 4].map(i => toLinear(Number.parseInt(v.slice(i, i + 2), 16) / 255)) as [number, number, number]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m_ - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m_ + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m_ - 0.808675766 * s
  return { L, C: Math.hypot(a, bb), h: (Math.atan2(bb, a) * 180 / Math.PI + 360) % 360 }
}

/** Sortie linéaire non bornée (pour tester le gamut). */
function oklchToLinearRgb({ L, C, h }: Oklch): [number, number, number] {
  const a = C * Math.cos(h * Math.PI / 180)
  const b = C * Math.sin(h * Math.PI / 180)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ]
}

const inGamut = (rgb: number[]) => rgb.every(c => c >= -0.0005 && c <= 1.0005)

export function oklchToHex(color: Oklch): string {
  let { C } = color
  let rgb = oklchToLinearRgb({ ...color, C })
  // Réduit la saturation (dichotomie) jusqu'à rentrer dans le gamut sRGB.
  if (!inGamut(rgb)) {
    let lo = 0
    let hi = C
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2
      if (inGamut(oklchToLinearRgb({ ...color, C: mid }))) lo = mid
      else hi = mid
    }
    C = lo
    rgb = oklchToLinearRgb({ ...color, C })
  }
  return `#${rgb.map((c) => {
    const v = Math.round(Math.min(1, Math.max(0, fromLinear(Math.min(1, Math.max(0, c))))) * 255)
    return v.toString(16).padStart(2, '0')
  }).join('')}`
}

/** Facteur de saturation par nuance (1 = celle de la couleur de départ). */
const CHROMA_CURVE: Record<Shade, number> = {
  50: 0.14, 100: 0.28, 200: 0.52, 300: 0.78, 400: 0.94, 500: 1, 600: 0.95, 700: 0.84, 800: 0.7, 900: 0.56, 950: 0.45
}

const LIGHT_END = 0.975
const dark_end = (l500: number) => (l500 >= 0.5 ? 0.22 : l500 * 0.45)

/** Palette complète dont la nuance 500 est EXACTEMENT la couleur donnée. */
export function generatePalette(hex500: string): Palette {
  const base = hexToOklch(hex500)
  const darkEnd = dark_end(base.L)
  const palette = {} as Palette
  SHADES.forEach((shade, index) => {
    if (shade === 500) {
      palette[shade] = hex500.toLowerCase()
      return
    }
    // index 0 (50) → 5 (500) → 10 (950)
    const L = index < 5
      ? LIGHT_END + (base.L - LIGHT_END) * (index / 5)
      : base.L + (darkEnd - base.L) * ((index - 5) / 5)
    palette[shade] = oklchToHex({ L, C: base.C * CHROMA_CURVE[shade], h: base.h })
  })
  return palette
}

/** Hex du 900 et du 50 de chaque neutre Tailwind (fond sombre / fond clair de la PWA). */
export const NEUTRAL_HEX: Record<NeutralColor, { 50: string, 900: string }> = {
  slate: { 50: '#f8fafc', 900: '#0f172a' },
  gray: { 50: '#f9fafb', 900: '#111827' },
  zinc: { 50: '#fafafa', 900: '#18181b' },
  neutral: { 50: '#fafafa', 900: '#171717' },
  stone: { 50: '#fafaf9', 900: '#1c1917' }
}

const AA = 4.5

export type PrimaryRejection = 'tooLight' | 'tooDark' | 'contrast'

export interface DerivedPrimary {
  primaryShade: { light: Shade, dark: Shade }
}

/**
 * Nuances de `primary` utilisées comme texte et boutons pleins, avec contraste AA (≥ 4,5:1) :
 * blanc sur la nuance en clair, la nuance sur le fond neutre 900 en sombre.
 * Refuse (renvoie la raison) une couleur trop claire ou trop sombre pour donner une palette
 * lisible, ou dont aucune nuance n'atteint AA.
 */
export function derivePrimaryShades(palette: Palette, neutral: NeutralColor): { ok: true, value: DerivedPrimary['primaryShade'] } | { ok: false, reason: PrimaryRejection } {
  const base = hexToOklch(palette[500])
  if (base.L > 0.93) return { ok: false, reason: 'tooLight' }
  if (base.L < 0.15) return { ok: false, reason: 'tooDark' }
  const light = ([500, 600, 700, 800, 900] as const).find(shade => contrastRatio('#ffffff', palette[shade]) >= AA)
  const dark = ([400, 300, 500, 200, 600] as const).find(shade => contrastRatio(palette[shade], NEUTRAL_HEX[neutral][900]) >= AA)
  if (!light || !dark) return { ok: false, reason: 'contrast' }
  return { ok: true, value: { light, dark } }
}
