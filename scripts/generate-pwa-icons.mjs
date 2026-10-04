#!/usr/bin/env node
// ============================================================================
//  Icônes de la PWA générées depuis public/favicon.svg (npm run pwa:icons)
// ============================================================================
//  public/pwa-192x192.png          icône « any » 192 px (coins arrondis du favicon)
//  public/pwa-512x512.png          icône « any » 512 px
//  public/maskable-icon-512x512.png icône « maskable » : fond terracotta plein
//                                   cadre, pictogramme réduit dans la zone sûre
//                                   (cercle de 80 % du côté, cf. w3.org/TR/appmanifest)
//  Les PNG sont versionnés : ce script n'est à relancer que si le favicon change.
//  `sharp` est fourni par @nuxt/image (dépendance transitive).
// ============================================================================
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = resolve(root, 'public')
const faviconSvg = await readFile(resolve(publicDir, 'favicon.svg'), 'utf8')

// Couleur et pictogramme (chemin Lucide « chef-hat ») repris du favicon.
const accent = /<rect[^>]*fill="(#[0-9a-fA-F]{3,8})"/.exec(faviconSvg)?.[1] ?? '#c2603e'
const glyph = /<g[^>]*>[\s\S]*?<\/g>/.exec(faviconSvg)?.[0]
if (!glyph) throw new Error('Pictogramme introuvable dans public/favicon.svg')

// Maskable : fond plein cadre ; pictogramme de 24 × 1,5 = 36 px sur 64 (56 %),
// centré, donc bien à l'intérieur du cercle de sécurité (51 px de diamètre).
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" fill="${accent}"/>
  ${glyph.replace(/transform="[^"]*"/, 'transform="translate(14 14) scale(1.5)"')}
</svg>`

const targets = [
  { file: 'pwa-192x192.png', svg: faviconSvg, size: 192 },
  { file: 'pwa-512x512.png', svg: faviconSvg, size: 512 },
  { file: 'maskable-icon-512x512.png', svg: maskableSvg, size: 512 }
]

for (const { file, svg, size } of targets) {
  // density élevée : rendu vectoriel net avant redimensionnement.
  await sharp(Buffer.from(svg), { density: Math.ceil((72 * size) / 64) })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(resolve(publicDir, file))
  console.log(`✓ public/${file} (${size}×${size})`)
}
