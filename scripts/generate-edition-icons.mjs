#!/usr/bin/env node
// ============================================================================
//  Icônes de l'édition « Recettes des Boultons » (npm run icons:boultons)
// ============================================================================
//  Source : public/images/logo.png (cocotte lavande, 500 × 390, fond transparent).
//  Sortie : public/editions/boultons/
//    favicon-32.png, favicon-48.png   onglet (fond transparent)
//    apple-touch-icon.png             raccourci iOS 180 px (fond blanc, marge)
//    pwa-192x192.png, pwa-512x512.png icônes Android « any » (fond blanc, marge)
//    maskable-icon-512x512.png        icône Android « maskable » : fond blanc plein
//                                     cadre, cocotte dans le cercle de sécurité
//                                     (80 % du côté, cf. w3.org/TR/appmanifest)
//  Les PNG sont versionnés : ce script n'est à relancer que si le logo change.
//  `sharp` est fourni par @nuxt/image (dépendance transitive).
// ============================================================================
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(root, 'public/images/logo.png')
const outDir = resolve(root, 'public/editions/boultons')

const transparent = { r: 0, g: 0, b: 0, alpha: 0 }
const white = { r: 255, g: 255, b: 255, alpha: 1 }

/** Logo centré dans un carré `size`, occupant `ratio` du côté, sur `background`. */
async function icon(file, size, ratio, background) {
  const inner = Math.round(size * ratio)
  const logo = await sharp(source)
    .resize(inner, inner, { fit: 'contain', background: transparent })
    .toBuffer()
  await sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(resolve(outDir, file))
}

await mkdir(outDir, { recursive: true })
await icon('favicon-32.png', 32, 1, transparent)
await icon('favicon-48.png', 48, 1, transparent)
await icon('apple-touch-icon.png', 180, 0.84, white)
await icon('pwa-192x192.png', 192, 0.84, white)
await icon('pwa-512x512.png', 512, 0.84, white)
// Maskable : la cocotte (ratio 1,28:1) tient dans un carré de 60 % du côté,
// donc dans le cercle de sécurité de 80 % de diamètre.
await icon('maskable-icon-512x512.png', 512, 0.6, white)

console.log(`Icônes de l'édition Boultons générées dans ${outDir}`)
