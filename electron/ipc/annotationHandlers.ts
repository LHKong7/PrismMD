import { ipcMain } from 'electron'
import { loadAnnotations, saveAnnotations } from '../services/annotationStore'

export function registerAnnotationHandlers() {
  ipcMain.handle('annotations:load', async (_event, filePath: string) => {
    return loadAnnotations(filePath)
  })

  ipcMain.handle('annotations:save', async (_event, filePath: string, annotations: unknown[]) => {
    return saveAnnotations(filePath, annotations as Parameters<typeof saveAnnotations>[1])
  })
}
