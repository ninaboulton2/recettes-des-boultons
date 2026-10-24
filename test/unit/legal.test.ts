import { describe, expect, it } from 'vitest'
import { LEGAL_PAGE_IDS, LEGAL_PATHS, legalTexts, normalizeContactEmail, type LegalBlock } from '#shared/legal'
import { legalEn } from '#shared/legal/en'
import { legalFr } from '#shared/legal/fr'

const shape = (block: LegalBlock) => block.type === 'ul' ? `ul:${block.items.length}` : block.type === 'link' ? `link:${block.href.startsWith('https://')}` : block.type

describe('pages légales : parité FR / EN', () => {
  it.each(LEGAL_PAGE_IDS)('%s : mêmes sections, mêmes blocs, même nombre de puces', (id) => {
    const fr = legalFr.pages[id]
    const en = legalEn.pages[id]
    expect(en.sections.map(s => s.id)).toEqual(fr.sections.map(s => s.id))
    for (const [index, section] of fr.sections.entries()) {
      expect(en.sections[index]!.blocks.map(shape)).toEqual(section.blocks.map(shape))
    }
  })

  it('aucun texte vide, aucun marqueur à compléter oublié', () => {
    for (const texts of [legalFr, legalEn]) {
      expect(texts.contactFallback.trim()).not.toBe('')
      for (const id of LEGAL_PAGE_IDS) {
        const doc = texts.pages[id]
        expect(doc.title.trim()).not.toBe('')
        expect(doc.intro.trim()).not.toBe('')
        const text = JSON.stringify(doc)
        expect(text).not.toMatch(/TODO|XXX|lorem|\{\{/i)
      }
    }
  })

  it('les liens externes sont en https', () => {
    for (const texts of [legalFr, legalEn]) {
      for (const id of LEGAL_PAGE_IDS) {
        for (const section of texts.pages[id].sections) {
          for (const block of section.blocks) if (block.type === 'link') expect(block.href).toMatch(/^https:\/\//)
        }
      }
    }
  })

  it('chaque page a une adresse distincte et le contact est prévu où il faut', () => {
    expect(new Set(Object.values(LEGAL_PATHS)).size).toBe(LEGAL_PAGE_IDS.length)
    const hasContact = (id: (typeof LEGAL_PAGE_IDS)[number]) => legalFr.pages[id].sections.some(s => s.blocks.some(b => b.type === 'contact'))
    expect(hasContact('mentions')).toBe(true)
    expect(hasContact('privacy')).toBe(true)
  })

  it('mentions légales option (a) : hébergeurs cités, aucun nom ni adresse de l\'éditrice', () => {
    const text = JSON.stringify(legalFr.pages.mentions)
    expect(text).toContain('Vercel')
    expect(text).toContain('Supabase')
    expect(text).toMatch(/ne pas rendre publics/)
  })

  it('choisit la langue, français par défaut', () => {
    expect(legalTexts('en')).toBe(legalEn)
    expect(legalTexts('fr')).toBe(legalFr)
    expect(legalTexts('de')).toBe(legalFr)
  })
})

describe('adresse de contact configurable', () => {
  it('accepte une adresse bien formée, espaces retirés', () => {
    expect(normalizeContactEmail('  contact@exemple.fr ')).toBe('contact@exemple.fr')
  })
  it('vide, absente ou mal formée : pas de contact (texte de repli)', () => {
    for (const value of [undefined, null, '', '   ', 'pas-un-mail', 'a@b', 'a b@c.fr', '<x>@y.fr', 42]) expect(normalizeContactEmail(value)).toBeNull()
  })
})
