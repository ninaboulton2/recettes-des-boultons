import type { ExportFile } from '#shared/utils/account'

/** Fait télécharger un fichier texte par le navigateur (lien temporaire `download`, rien n'est envoyé nulle part). Client seulement. */
export function downloadTextFile(file: ExportFile): void {
  const url = URL.createObjectURL(new Blob([file.content], { type: file.mime }))
  const link = document.createElement('a')
  link.href = url
  link.download = file.filename
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
