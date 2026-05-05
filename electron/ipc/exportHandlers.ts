import { BrowserWindow, dialog, ipcMain, app } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import { getMainWindow } from '../main'

export function registerExportHandlers() {
  ipcMain.handle(
    'export:html',
    async (_event, htmlContent: string, title: string) => {
      const win = getMainWindow()
      if (!win) return { cancelled: true }
      const result = await dialog.showSaveDialog(win, {
        title: 'Export as HTML',
        defaultPath: `${title}.html`,
        filters: [{ name: 'HTML', extensions: ['html'] }],
      })
      if (result.canceled || !result.filePath) return { cancelled: true }
      await fs.writeFile(result.filePath, htmlContent, 'utf-8')
      return { cancelled: false, filePath: result.filePath }
    },
  )

  ipcMain.handle(
    'export:pdf',
    async (_event, htmlContent: string, title: string) => {
      const win = getMainWindow()
      if (!win) return { cancelled: true }
      const result = await dialog.showSaveDialog(win, {
        title: 'Export as PDF',
        defaultPath: `${title}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      })
      if (result.canceled || !result.filePath) return { cancelled: true }

      // Use a temp file if the HTML is very large
      let loadUrl: string
      let tempFile: string | null = null

      if (htmlContent.length > 2_000_000) {
        tempFile = path.join(app.getPath('temp'), `prismmd-export-${Date.now()}.html`)
        await fs.writeFile(tempFile, htmlContent, 'utf-8')
        loadUrl = `file://${tempFile}`
      } else {
        loadUrl = `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`
      }

      const hiddenWin = new BrowserWindow({
        show: false,
        width: 800,
        height: 600,
        webPreferences: { offscreen: true },
      })

      try {
        await hiddenWin.loadURL(loadUrl)
        const pdfBuffer = await hiddenWin.webContents.printToPDF({
          printBackground: true,
          pageSize: 'A4',
          margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
        })
        await fs.writeFile(result.filePath, pdfBuffer)
        return { cancelled: false, filePath: result.filePath }
      } finally {
        hiddenWin.destroy()
        if (tempFile) {
          fs.unlink(tempFile).catch(() => {})
        }
      }
    },
  )

  ipcMain.handle(
    'export:docx',
    async (_event, buffer: ArrayBuffer, title: string) => {
      const win = getMainWindow()
      if (!win) return { cancelled: true }
      const result = await dialog.showSaveDialog(win, {
        title: 'Export as Word Document',
        defaultPath: `${title}.docx`,
        filters: [{ name: 'Word Document', extensions: ['docx'] }],
      })
      if (result.canceled || !result.filePath) return { cancelled: true }
      await fs.writeFile(result.filePath, Buffer.from(buffer))
      return { cancelled: false, filePath: result.filePath }
    },
  )

  ipcMain.handle('export:print', async (_event, htmlContent: string) => {
    // Use the main window's webContents to print.
    // Strategy: open a child window (visible, to support the OS print dialog),
    // load the HTML, print, then close.
    const parent = getMainWindow()

    let tempFile: string | null = null
    const tempPath = path.join(app.getPath('temp'), `prismmd-print-${Date.now()}.html`)
    await fs.writeFile(tempPath, htmlContent, 'utf-8')
    tempFile = tempPath

    const printWin = new BrowserWindow({
      parent: parent ?? undefined,
      show: false,
      width: 800,
      height: 600,
      webPreferences: { offscreen: false },
    })

    await printWin.loadFile(tempFile)

    // Give the page a moment to finish rendering (fonts, KaTeX, etc.)
    await new Promise((r) => setTimeout(r, 500))

    // Show briefly so the OS print dialog can attach to a visible window
    printWin.show()

    await new Promise<void>((resolve) => {
      printWin.webContents.print(
        { silent: false, printBackground: true },
        () => {
          // Resolve regardless of success/cancel — user may cancel the dialog
          resolve()
        },
      )
    })

    printWin.destroy()
    if (tempFile) {
      fs.unlink(tempFile).catch(() => {})
    }
  })
}
