/**
 * Boot-time side effects that MUST run before any module resolves a path
 * under `userData` (electron-store builds its store at import; workspaceDb
 * resolves DB_PATH at import). This file is therefore the FIRST import in
 * `main.ts` — keep it that way.
 */
import { app } from 'electron'
import { appConfig } from '../app.config'
import { applyDataLocation } from './services/dataLocation'

// 1. App identity first, so the default userData dir is `.../<name>`.
app.setName(appConfig.name)
// 2. Then redirect userData to the user's custom folder if one is configured.
applyDataLocation()
