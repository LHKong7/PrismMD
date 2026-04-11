import type { ElectronAPI } from '../types/electron'

export function getElectronAPI(): ElectronAPI {
  return window.electronAPI
}
