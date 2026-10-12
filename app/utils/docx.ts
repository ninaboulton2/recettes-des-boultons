/**
 * Extraction du texte d'un document Word (`.docx`) dans le navigateur, sans
 * serveur ni appel IA : le texte rejoint la zone de saisie du traducteur,
 * comme un fichier `.txt`.
 *
 * Un `.docx` est une archive ZIP dont le corps est `word/document.xml`.
 * `fflate` (≈ 3 Ko gzip, chargé à la demande par `import()` au premier `.docx`)
 * la décompresse ; le XML est lu avec le `DOMParser` du navigateur. Plutôt que
 * `mammoth` (bien plus lourd avec jszip et bluebird, orienté HTML) : on n'a besoin que
 * du texte brut, avec ses retours à la ligne.
 *
 * Conservé : un paragraphe = une ligne, les puces et numéros = « - » en début
 * de ligne, tabulations et sauts de ligne, cellules de tableau (une ligne par
 * paragraphe). Ignoré : images, en-têtes / pieds de page, notes, texte supprimé
 * en suivi de modifications.
 */

export type DocxErrorCode = 'corrupt' | 'empty'

/** Document illisible (`corrupt`) ou sans texte (`empty`) : le code est traduit par l'interface. */
export class DocxError extends Error {
  code: DocxErrorCode

  constructor(code: DocxErrorCode) {
    super(`Document Word : ${code}`)
    this.name = 'DocxError'
    this.code = code
  }
}

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const DOCUMENT_PART = 'word/document.xml'
/** Garde-fou contre une archive piégée (« zip bomb ») : taille maximale du XML décompressé. */
const MAX_XML_BYTES = 50 * 1024 * 1024

const localName = (node: Element): string => node.localName

/** Valeur de `w:val` (repli sur le nom qualifié si l'environnement gère mal les espaces de noms). */
const valueOf = (node: Element): string => node.getAttributeNS(W_NS, 'val') ?? node.getAttribute('w:val') ?? ''

/** Texte d'un paragraphe `w:p` (sans ses éventuels paragraphes imbriqués, traités à part). */
function paragraphText(paragraph: Element): string {
  let text = ''
  const walk = (node: Element): void => {
    for (const child of Array.from(node.children)) {
      if (child.namespaceURI !== W_NS) {
        // Texte en double des zones de texte (`mc:AlternateContent` : version de repli).
        if (localName(child) === 'AlternateContent') {
          const choice = Array.from(child.children).find(candidate => localName(candidate) === 'Choice')
          if (choice) walk(choice)
        } else {
          walk(child)
        }
        continue
      }
      switch (localName(child)) {
        case 't':
          text += child.textContent ?? ''
          break
        case 'tab':
          // `w:tab` sans enfant = tabulation ; `w:tabs` (définition des taquets) est ailleurs.
          text += '\t'
          break
        case 'br':
        case 'cr':
          text += '\n'
          break
        case 'noBreakHyphen':
          text += '-'
          break
        case 'p':
        case 'delText':
        case 'pPr':
        case 'rPr':
          // Paragraphe imbriqué (zone de texte) : listé séparément ; le reste n'est pas du contenu.
          break
        default:
          walk(child)
      }
    }
  }
  walk(paragraph)
  return text
}

/** Style de liste intégré de Word (« List Bullet », « List Number »…) : la numérotation est dans le style. */
const LIST_STYLE = /^List(Bullet|Number)/i

/** Paragraphe d'une liste à puces ou numérotée (`w:numPr` avec un `numId` non nul, ou style de liste). */
function isListItem(paragraph: Element): boolean {
  const properties = Array.from(paragraph.children).find(child => localName(child) === 'pPr')
  if (!properties) return false
  return Array.from(properties.children).some((property) => {
    if (localName(property) === 'pStyle') return LIST_STYLE.test(valueOf(property))
    if (localName(property) !== 'numPr') return false
    const numId = Array.from(property.children).find(child => localName(child) === 'numId')
    return (numId ? valueOf(numId) : '') !== '0'
  })
}

/** Vrai pour un paragraphe de la version de repli d'une zone de texte (doublon de la version principale). */
function inFallback(paragraph: Element): boolean {
  for (let node = paragraph.parentElement; node; node = node.parentElement) {
    if (localName(node) === 'Fallback') return true
  }
  return false
}

/** Texte brut d'un `word/document.xml` : une ligne par paragraphe, ligne vide entre les blocs de texte. */
export function docxXmlToText(xml: string): string {
  // Déclaration `<?xml …?>` retirée : inutile (le texte est déjà décodé) et certains analyseurs refusent les guillemets simples.
  const parsed = new DOMParser().parseFromString(xml.replace(/^\uFEFF?\s*<\?xml[^>]*\?>/, ''), 'application/xml')
  if (parsed.getElementsByTagName('parsererror').length > 0 || parsed.documentElement.localName !== 'document') {
    throw new DocxError('corrupt')
  }
  const lines: string[] = []
  for (const paragraph of Array.from(parsed.getElementsByTagName('*')).filter(node => node.namespaceURI === W_NS && localName(node) === 'p')) {
    if (inFallback(paragraph)) continue
    const text = paragraphText(paragraph).replace(/[ \t]+$/gm, '')
    // Un paragraphe vide devient une ligne vide (séparation des blocs) ; on ne les empile pas.
    if (text.trim() === '') {
      if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('')
    } else {
      lines.push(isListItem(paragraph) ? `- ${text.trimStart()}` : text)
    }
  }
  return lines.join('\n').trim()
}

/**
 * Texte d'un fichier `.docx`. Lève `DocxError` : `corrupt` (pas une archive
 * Word valide) ou `empty` (aucun texte, par exemple un document d'images).
 */
export async function extractDocxText(source: Blob | ArrayBuffer): Promise<string> {
  let xml: string
  try {
    const buffer = source instanceof ArrayBuffer ? source : await source.arrayBuffer()
    const { unzipSync, strFromU8 } = await import('fflate')
    const parts = unzipSync(new Uint8Array(buffer), {
      // Seul le corps du document est décompressé (et seulement s'il reste raisonnable).
      filter: entry => entry.name === DOCUMENT_PART && entry.originalSize <= MAX_XML_BYTES
    })
    const body = parts[DOCUMENT_PART]
    if (!body) throw new DocxError('corrupt')
    xml = strFromU8(body)
  } catch (error: unknown) {
    throw error instanceof DocxError ? error : new DocxError('corrupt')
  }
  const text = docxXmlToText(xml)
  if (text === '') throw new DocxError('empty')
  return text
}
