/**
 * Windows install-time integration: Squirrel lifecycle plus file associations.
 *
 * Squirrel.Windows re-launches the app with `--squirrel-*` flags at install,
 * update and uninstall. Without handling them the app briefly opens a window
 * during install and never gets a chance to register anything.
 *
 * File associations can't be declared the way `CFBundleDocumentTypes` does it
 * on macOS — Windows wants registry keys. Everything here writes to `HKCU`
 * so no elevation is needed, and registers via **`OpenWithProgids`**, which
 * adds PrismMD to a file's "Open with" list *without* seizing the default
 * handler. Silently becoming the system's PDF reader would be hostile; the
 * user can still promote us from Explorer if they want to.
 */
import { app } from 'electron'
import { execFile } from 'child_process'
import * as path from 'path'
import { promisify } from 'util'
import { ALL_SUPPORTED_EXTS, mimeOfExt } from './fileFormats'

const execFileAsync = promisify(execFile)

const PROGID_PREFIX = 'PrismMD'

function isWindows(): boolean {
  return process.platform === 'win32'
}

/** `reg.exe` is always present on Windows; failures are logged, never fatal. */
async function reg(args: string[]): Promise<void> {
  try {
    await execFileAsync('reg', args, { windowsHide: true })
  } catch (err) {
    console.warn('[win] reg', args[0], args[1], '→', err instanceof Error ? err.message : err)
  }
}

function exePath(): string {
  // Squirrel installs to ...\<AppName>\app-<version>\<exe>, and the stub
  // launcher one level up survives updates — point associations at the stub.
  const exe = path.basename(process.execPath)
  const stub = path.resolve(process.execPath, '..', '..', exe)
  return stub
}

/**
 * Add PrismMD to the "Open with" list for every format the reader can render.
 */
export async function registerFileAssociations(): Promise<void> {
  if (!isWindows()) return
  const exe = exePath()

  for (const ext of ALL_SUPPORTED_EXTS) {
    const progId = `${PROGID_PREFIX}.${ext}`
    const classes = `HKCU\\Software\\Classes`

    await reg(['add', `${classes}\\${progId}`, '/ve', '/d', `${app.getName()} document`, '/f'])
    await reg([
      'add',
      `${classes}\\${progId}\\shell\\open\\command`,
      '/ve',
      '/d',
      `"${exe}" "%1"`,
      '/f',
    ])
    await reg(['add', `${classes}\\${progId}\\DefaultIcon`, '/ve', '/d', `"${exe}",0`, '/f'])

    // Offer, don't seize: this appears in "Open with" without changing the
    // user's current default for the extension.
    await reg(['add', `${classes}\\.${ext}\\OpenWithProgids`, '/v', progId, '/t', 'REG_NONE', '/f'])

    // Lets Explorer's "Open with → Choose another app" find us by type.
    await reg([
      'add',
      `${classes}\\Applications\\${path.basename(exe)}\\SupportedTypes`,
      '/v',
      `.${ext}`,
      '/t',
      'REG_SZ',
      '/d',
      mimeOfExt(`.${ext}`),
      '/f',
    ])
  }
}

export async function unregisterFileAssociations(): Promise<void> {
  if (!isWindows()) return
  const exe = path.basename(exePath())

  for (const ext of ALL_SUPPORTED_EXTS) {
    const progId = `${PROGID_PREFIX}.${ext}`
    await reg(['delete', `HKCU\\Software\\Classes\\${progId}`, '/f'])
    await reg(['delete', `HKCU\\Software\\Classes\\.${ext}\\OpenWithProgids`, '/v', progId, '/f'])
  }
  await reg(['delete', `HKCU\\Software\\Classes\\Applications\\${exe}`, '/f'])
}

/**
 * Handle a Squirrel lifecycle launch.
 *
 * @returns true when this launch was Squirrel talking to us, in which case the
 *   caller must quit without opening a window.
 */
export async function handleSquirrelEvent(): Promise<boolean> {
  if (!isWindows() || process.argv.length < 2) return false

  const event = process.argv[1]
  switch (event) {
    case '--squirrel-install':
    case '--squirrel-updated':
      await registerFileAssociations()
      return true
    case '--squirrel-uninstall':
      await unregisterFileAssociations()
      return true
    case '--squirrel-obsolete':
      // An older version being retired during an update; nothing to undo.
      return true
    default:
      return false
  }
}
