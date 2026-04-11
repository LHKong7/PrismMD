import { ipcMain } from 'electron'
import { loadSettings, saveSettings } from '../services/settingsStore'

export function registerSettingsHandlers() {
  ipcMain.handle('settings:load', () => {
    return loadSettings()
  })

  ipcMain.handle('settings:save', (_event, settings) => {
    saveSettings(settings)
  })
}
