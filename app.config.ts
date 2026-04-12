/**
 * Single source of truth for app identity.
 *
 * Edit this file to rebrand the application — name, bundle ID, icon, description.
 * All other configs (Electron Forge, window title, HTML title) read from here.
 *
 * Icon notes:
 * - Place icon files in `build/` at the project root (no extension in the path below).
 * - Electron Forge will automatically pick the right format per platform:
 *     build/icon.icns  → macOS
 *     build/icon.ico   → Windows
 *     build/icon.png   → Linux (512x512 recommended)
 * - If `icon` is left empty, Electron's default icon is used.
 */
export const appConfig = {
  /** Display name shown in menus, Finder, installers, dock, etc. */
  name: 'PrismMD',

  /** Short executable name (lowercase, no spaces). Used for the binary. */
  executableName: 'prismmd',

  /** Reverse-DNS bundle identifier. Must be unique. */
  appBundleId: 'com.prismmd.app',

  /** One-line description shown in installers and system metadata. */
  description: 'A beautiful cross-platform AI-Native reader',

  /**
   * Icon path without extension. Forge appends the right extension per platform.
   * Set to `null` to use Electron's default icon.
   * Example: 'build/icon'
   */
  icon: 'build/icon' as string | null,
} as const

export type AppConfig = typeof appConfig
