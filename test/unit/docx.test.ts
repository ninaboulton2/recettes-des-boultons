import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { DocxError, docxXmlToText, extractDocxText } from '../../app/utils/docx'
import { classifyRecipeFile, DOCX_MIME_TYPE, isLegacyWordFile } from '../../shared/schemas/media'

/**
 * Extraction de texte d'un .docx dans le navigateur : un vrai document
 * (test/fixtures/gateau-yaourt.docx, produit par python-docx : titres, puces,
 * numérotation, saut de ligne, tableau) et des documents minimaux fabriqués ici.
 */

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const documentXml = (body: string) => `<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>${body}</w:body></w:document>`

function buildDocx(body: string): Uint8Array {
  return zipSync({ 'word/document.xml': strToU8(documentXml(body)) })
}

const toBuffer = (bytes: Uint8Array): ArrayBuffer => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer

describe('extractDocxText : vrai document Word', () => {
  const real = readFileSync(resolve(process.cwd(), 'test/fixtures/gateau-yaourt.docx'))

  it('garde les paragraphes, les listes, les sauts de ligne et les tableaux', async () => {
    const text = await extractDocxText(new Blob([new Uint8Array(real)]))
    const lines = text.split('\n')
    expect(lines[0]).toBe('Gâteau au yaourt de Mamie')
    expect(lines).toContain('Pour 6 personnes. Préparation : 15 minutes.')
    expect(lines).toContain('- 1 pot de yaourt nature')
    expect(lines).toContain('- 3 œufs')
    expect(lines).toContain('- Cuire 35 minutes.')
    // Saut de ligne dans un paragraphe conservé.
    expect(text).toContain('Astuce : servir tiède\navec de la chantilly.')
    expect(text).toContain('Calories')
    expect(text).toContain('320 kcal')
    expect(text).not.toMatch(/\n{3,}/)
  })

  it('accepte aussi un ArrayBuffer', async () => {
    const buffer = toBuffer(new Uint8Array(real))
    expect(await extractDocxText(buffer)).toContain('Gâteau au yaourt de Mamie')
  })
})

describe('extractDocxText : documents minimaux', () => {
  it('un paragraphe = une ligne, un paragraphe vide = une séparation', async () => {
    const bytes = buildDocx('<w:p><w:r><w:t>Tarte</w:t></w:r></w:p><w:p/><w:p/><w:p><w:r><w:t xml:space="preserve">200 g de </w:t></w:r><w:r><w:t>farine</w:t></w:r></w:p>')
    expect(await extractDocxText(toBuffer(bytes))).toBe('Tarte\n\n200 g de farine')
  })

  it('liste à puces (numPr), tabulation et saut de ligne', async () => {
    const bytes = buildDocx(
      '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="3"/></w:numPr></w:pPr><w:r><w:t>Beurre</w:t><w:tab/><w:t>50 g</w:t></w:r></w:p>'
      + '<w:p><w:pPr><w:numPr><w:numId w:val="0"/></w:numPr></w:pPr><w:r><w:t>Pas une puce</w:t><w:br/><w:t>suite</w:t></w:r></w:p>'
    )
    expect(await extractDocxText(toBuffer(bytes))).toBe('- Beurre\t50 g\nPas une puce\nsuite')
  })

  it('ignore le texte supprimé en suivi de modifications et la version de repli des zones de texte', async () => {
    const bytes = buildDocx(
      '<w:p><w:r><w:t>Garder</w:t></w:r><w:del><w:r><w:delText>Supprimé</w:delText></w:r></w:del></w:p>'
    )
    expect(await extractDocxText(toBuffer(bytes))).toBe('Garder')
  })

  it('décode les entités XML', async () => {
    const bytes = buildDocx('<w:p><w:r><w:t>Sel &amp; poivre &lt;2 g&gt;</w:t></w:r></w:p>')
    expect(await extractDocxText(toBuffer(bytes))).toBe('Sel & poivre <2 g>')
  })
})

describe('extractDocxText : erreurs', () => {
  const codeOf = async (source: Blob | ArrayBuffer) => {
    try {
      await extractDocxText(source)
    } catch (error: unknown) {
      if (error instanceof DocxError) return error.code
      throw error
    }
    return null
  }

  it('un fichier qui n\'est pas une archive : corrupt', async () => {
    expect(await codeOf(new Blob(['ceci n\'est pas un document Word']))).toBe('corrupt')
  })

  it('une archive tronquée : corrupt', async () => {
    const real = readFileSync(resolve(process.cwd(), 'test/fixtures/gateau-yaourt.docx'))
    expect(await codeOf(new Blob([new Uint8Array(real).slice(0, 2000)]))).toBe('corrupt')
  })

  it('une archive sans word/document.xml : corrupt', async () => {
    const bytes = zipSync({ 'autre.txt': strToU8('x') })
    expect(await codeOf(toBuffer(bytes))).toBe('corrupt')
  })

  it('un word/document.xml mal formé : corrupt', async () => {
    const bytes = zipSync({ 'word/document.xml': strToU8('<w:document><w:body>') })
    expect(await codeOf(toBuffer(bytes))).toBe('corrupt')
  })

  it('un document sans texte (images seulement) : empty', async () => {
    expect(await codeOf(toBuffer(buildDocx('<w:p/><w:p><w:r><w:drawing/></w:r></w:p>')))).toBe('empty')
  })
})

describe('docxXmlToText', () => {
  it('refuse un XML qui n\'est pas un document Word', () => {
    expect(() => docxXmlToText('<html/>')).toThrowError(DocxError)
  })
})

describe('classification des fichiers Word', () => {
  it('.docx reconnu par le type MIME ou par l\'extension', () => {
    expect(classifyRecipeFile({ name: 'a', type: DOCX_MIME_TYPE })).toBe('docx')
    expect(classifyRecipeFile({ name: 'Recette.DOCX', type: '' })).toBe('docx')
    expect(classifyRecipeFile({ name: 'recette.docx', type: 'application/octet-stream' })).toBe('docx')
    expect(classifyRecipeFile({ name: 'recette.docx', type: 'application/zip' })).toBe('docx')
  })

  it('l\'ancien .doc n\'est pas pris en charge mais est reconnu pour un message clair', () => {
    expect(classifyRecipeFile({ name: 'recette.doc', type: 'application/msword' })).toBeNull()
    expect(classifyRecipeFile({ name: 'recette.doc', type: '' })).toBeNull()
    expect(isLegacyWordFile({ name: 'recette.doc', type: 'application/msword' })).toBe(true)
    expect(isLegacyWordFile({ name: 'RECETTE.DOC', type: '' })).toBe(true)
    expect(isLegacyWordFile({ name: 'recette.docx', type: DOCX_MIME_TYPE })).toBe(false)
    expect(isLegacyWordFile({ name: 'recette.pdf', type: 'application/pdf' })).toBe(false)
  })
})
