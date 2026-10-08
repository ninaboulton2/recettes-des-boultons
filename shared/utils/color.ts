/**
 * Couleurs : luminance relative et contraste WCAG 2 pour les formats
 * utilisés par le thème (`#rrggbb` des palettes d'édition, `oklch(…)` des
 * neutres Tailwind 4). Sert aux tests de contraste des éditions (et, en v2,
 * à valider une palette fournie par un groupe).
 */

/** Composantes sRGB linéaires (0 → 1). */
type LinearRgb = readonly [number, number, number]

const toLinear = (channel: number) =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4

function hexToLinear(hex: string): LinearRgb | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match?.[1]) return null
  const value = match[1]
  const channel = (index: number) => toLinear(Number.parseInt(value.slice(index, index + 2), 16) / 255)
  return [channel(0), channel(2), channel(4)]
}

/** `oklch(L% C H)` → sRGB linéaire (matrices de Björn Ottosson), borné à [0, 1]. */
function oklchToLinear(value: string): LinearRgb | null {
  const match = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*\)$/i.exec(value.trim())
  if (!match) return null
  const lightness = Number(match[1]) / (match[2] ? 100 : 1)
  const chroma = Number(match[3])
  const hue = (Number(match[4]) * Math.PI) / 180
  const a = chroma * Math.cos(hue)
  const b = chroma * Math.sin(hue)
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.2914855480 * b) ** 3
  const clamp = (channel: number) => Math.min(1, Math.max(0, channel))
  return [
    clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)
  ]
}

/** Luminance relative WCAG (0 = noir, 1 = blanc). */
export function relativeLuminance(color: string): number {
  const rgb = hexToLinear(color) ?? oklchToLinear(color)
  if (!rgb) throw new Error(`Couleur non reconnue : ${color}`)
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
}

/** Rapport de contraste WCAG entre deux couleurs (1 → 21). AA texte : ≥ 4,5. */
export function contrastRatio(foreground: string, background: string): number {
  const [light, dark] = [relativeLuminance(foreground), relativeLuminance(background)].sort((x, y) => y - x) as [number, number]
  return (light + 0.05) / (dark + 0.05)
}
