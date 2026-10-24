import { z } from 'zod'
import { HEX_COLOR_PATTERN } from '../themes/schema'

/**
 * Catégories personnelles (table `categories`, 0017 ; écritures directes autorisées par les politiques de 0019,
 * « chacun les siennes » : pas de RPC). La base ne contrôle PAS `icon` ni `color` (texte libre) : ce sont des entrées
 * non fiables à la lecture comme à l'écriture. Liste blanche d'icônes ; couleur `#rrggbb` uniquement.
 */

/** Icônes Lucide proposées (`i-lucide-*`). Toute autre valeur lue en base est remplacée par l'icône par défaut. */
export const CATEGORY_ICON_CHOICES = [
  'i-lucide-soup', 'i-lucide-salad', 'i-lucide-utensils', 'i-lucide-fish', 'i-lucide-beef', 'i-lucide-milk',
  'i-lucide-cake-slice', 'i-lucide-cup-soda', 'i-lucide-cherry', 'i-lucide-cookie', 'i-lucide-croissant',
  'i-lucide-pizza', 'i-lucide-sandwich', 'i-lucide-egg', 'i-lucide-apple', 'i-lucide-carrot', 'i-lucide-wheat',
  'i-lucide-ice-cream-cone', 'i-lucide-wine', 'i-lucide-coffee', 'i-lucide-beer', 'i-lucide-leaf',
  'i-lucide-drumstick', 'i-lucide-ham', 'i-lucide-popcorn', 'i-lucide-sprout', 'i-lucide-flame',
  'i-lucide-cooking-pot', 'i-lucide-citrus', 'i-lucide-grape', 'i-lucide-banana', 'i-lucide-candy',
  'i-lucide-cake', 'i-lucide-utensils-crossed', 'i-lucide-hamburger', 'i-lucide-vegan', 'i-lucide-nut',
  'i-lucide-bean', 'i-lucide-martini', 'i-lucide-shrimp', 'i-lucide-egg-fried', 'i-lucide-donut',
  'i-lucide-heart', 'i-lucide-star', 'i-lucide-chef-hat'
] as const
export type CategoryIcon = typeof CATEGORY_ICON_CHOICES[number]
export const DEFAULT_CATEGORY_ICON: CategoryIcon = 'i-lucide-chef-hat'

/** Pastilles de couleur proposées (hex). La couleur libre reste possible, toujours `#rrggbb`. */
export const CATEGORY_COLOR_CHOICES = [
  '#c2603e', '#d97706', '#ca8a04', '#65a30d', '#16a34a', '#0d9488',
  '#0284c7', '#2563eb', '#7c3aed', '#c026d3', '#e11d48', '#64748b'
] as const

export const MAX_CATEGORIES = 60
export const CATEGORY_NAME_MAX = 40

/** Pas de caractère de contrôle ni de chevron : le nom est affiché comme du texte, jamais comme du HTML. */
const NAME_FORBIDDEN = /[\p{Cc}\p{Cf}<>]/u
const categoryName = z.string().trim().min(1, 'requis').max(CATEGORY_NAME_MAX, `trop long (max ${CATEGORY_NAME_MAX} caractères)`)
  .refine(value => !NAME_FORBIDDEN.test(value), 'caractères non autorisés')

export const categoryIconSchema = z.enum(CATEGORY_ICON_CHOICES)
export const categoryColorSchema = z.string().regex(HEX_COLOR_PATTERN, 'couleur au format #rrggbb').transform(value => value.toLowerCase())

const emptyToNull = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value)

/** Création / modification : au moins un nom (français ou anglais). */
export const categoryFieldsSchema = z.object({
  nameFr: z.preprocess(emptyToNull, categoryName.nullish()),
  nameEn: z.preprocess(emptyToNull, categoryName.nullish()),
  icon: categoryIconSchema.default(DEFAULT_CATEGORY_ICON),
  color: z.preprocess(emptyToNull, categoryColorSchema.nullish())
}).refine(value => !!value.nameFr || !!value.nameEn, { path: ['nameFr'], message: 'un nom est requis' })

export type CategoryFields = z.infer<typeof categoryFieldsSchema>
export type CategoryFieldsInput = z.input<typeof categoryFieldsSchema>
