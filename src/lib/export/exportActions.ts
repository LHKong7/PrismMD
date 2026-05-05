import { useFileStore } from '../../store/fileStore'
import { useEditorStore } from '../../store/editorStore'
import { useSettingsStore } from '../../store/settingsStore'
import { markdownToHtml, markdownToHast } from './exportPipeline'
import { buildStandaloneHtml } from './buildStandaloneHtml'
import { hastToDocxBuffer } from './hastToDocx'

function getDocumentInfo(): { content: string; title: string; themeId: string } | null {
  const editor = useEditorStore.getState()
  const file = useFileStore.getState()

  // Use editor content if editing, otherwise use file content
  const content = editor.editing ? editor.editorContent : file.currentContent
  if (!content) return null

  const filePath = file.currentFilePath ?? 'Untitled'
  const title = filePath.split(/[/\\]/).pop()?.replace(/\.[^/.]+$/, '') ?? 'Untitled'
  const themeId = useSettingsStore.getState().themeId

  return { content, title, themeId }
}

async function showToast(type: 'success' | 'error', message: string) {
  const { useToastStore } = await import('../../store/toastStore')
  useToastStore.getState().show(type, message)
}

export async function exportToHtml(): Promise<void> {
  const info = getDocumentInfo()
  if (!info) return

  try {
    const html = await markdownToHtml(info.content)
    const standaloneHtml = buildStandaloneHtml(html, info.themeId, info.title)
    const result = await window.electronAPI.exportHtml(standaloneHtml, info.title)
    if (!result.cancelled) {
      await showToast('success', 'Exported as HTML')
    }
  } catch (err) {
    await showToast('error', `Export failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export async function exportToPdf(): Promise<void> {
  const info = getDocumentInfo()
  if (!info) return

  try {
    const html = await markdownToHtml(info.content)
    const standaloneHtml = buildStandaloneHtml(html, info.themeId, info.title)
    const result = await window.electronAPI.exportPdf(standaloneHtml, info.title)
    if (!result.cancelled) {
      await showToast('success', 'Exported as PDF')
    }
  } catch (err) {
    await showToast('error', `Export failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export async function exportToDocx(): Promise<void> {
  const info = getDocumentInfo()
  if (!info) return

  try {
    const hast = await markdownToHast(info.content)
    const buffer = await hastToDocxBuffer(hast, info.title)
    const result = await window.electronAPI.exportDocx(buffer, info.title)
    if (!result.cancelled) {
      await showToast('success', 'Exported as Word document')
    }
  } catch (err) {
    await showToast('error', `Export failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export async function printDocument(): Promise<void> {
  const info = getDocumentInfo()
  if (!info) return

  try {
    const html = await markdownToHtml(info.content)
    const standaloneHtml = buildStandaloneHtml(html, info.themeId, info.title)
    await window.electronAPI.printDocument(standaloneHtml)
  } catch (err) {
    await showToast('error', `Print failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}
