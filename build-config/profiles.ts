import type { ForgeConfig } from '@electron-forge/shared-types'
import { MakerDMG } from '@electron-forge/maker-dmg'
import { MakerZIP } from '@electron-forge/maker-zip'
import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { MakerDeb } from '@electron-forge/maker-deb'
import { appConfig } from '../app.config'

/**
 * A build profile declares the pieces of the Electron Forge config that
 * differ between `npm run dev` (fast local iteration) and
 * `npm run package` / `npm run make` (distributable artifacts).
 *
 * Everything not listed here is shared across profiles (bundle id, icon,
 * vite plugin, file-type associations, etc.) and lives in forge.config.ts.
 */
export interface BuildProfile {
  /** Profile name for logging. */
  name: 'dev' | 'prod'

  /** Overrides merged into `packagerConfig`. */
  packagerOverrides: Partial<NonNullable<ForgeConfig['packagerConfig']>>

  /**
   * Makers enabled for this profile. Only relevant to `npm run make`;
   * `npm run package` / `npm run start` ignore this list.
   *
   * Keep dev light so local packaging is fast and doesn't require
   * platform-specific tools (DMG, Squirrel, deb).
   */
  makers: NonNullable<ForgeConfig['makers']>

  /** `outDir` override so dev and prod artifacts don't stomp on each other. */
  outDir: string
}

/**
 * Dev profile — optimized for fast iteration.
 *
 * - asar disabled: quicker rebuilds, easier to inspect bundled files.
 * - Makers: ZIP only (works on every platform without extra toolchain).
 * - Output lives in `out/dev` so a prod build from the same workspace is
 *   preserved.
 */
export const devProfile: BuildProfile = {
  name: 'dev',
  packagerOverrides: {
    asar: false,
    appCopyright: `Copyright © ${new Date().getFullYear()} ${appConfig.name} (dev build)`,
  },
  makers: [new MakerZIP({})],
  outDir: 'out/dev',
}

/**
 * Prod profile — full distributable build.
 *
 * - asar enabled, with the same unpack list used for native/fs-watcher deps.
 * - Every maker the project supports.
 * - Output lives in `out/dist`.
 */
export const prodProfile: BuildProfile = {
  name: 'prod',
  packagerOverrides: {
    asar: {
      // All external node_modules (and their transitive deps) are included
      // by the custom `ignore` function in forge.config.ts. Unpack everything
      // under node_modules so require() can resolve them at runtime.
      unpack: '**/node_modules/**',
    },
    appCopyright: `Copyright © ${new Date().getFullYear()} ${appConfig.name}`,
  },
  makers: [
    new MakerDMG({
      ...(appConfig.icon ? { icon: `${appConfig.icon}.icns` } : {}),
    }),
    new MakerZIP({}, ['darwin']),
    new MakerSquirrel({
      name: appConfig.name,
      // NOTE: `iconUrl` requires a full URL (https://…) for NuGet — omit it
      // for local builds. `setupIcon` accepts a local path and sets the
      // installer/uninstaller icon.
      ...(appConfig.icon ? { setupIcon: `${appConfig.icon}.ico` } : {}),
    }),
    new MakerDeb({
      options: {
        categories: ['Utility'],
        mimeType: ['text/markdown'],
        ...(appConfig.icon ? { icon: `${appConfig.icon}.png` } : {}),
      },
    }),
  ],
  outDir: 'out/dist',
}

/**
 * Resolve the active profile from the environment, with the following
 * precedence (highest → lowest):
 *
 * 1. Explicit `APP_PROFILE=dev|prod` env var (useful for CI / overrides).
 * 2. The npm script name (`npm_lifecycle_event`) — `package` / `make` / `publish`
 *    imply prod, everything else (including `dev` / `start`) implies dev.
 * 3. `NODE_ENV=production` as a last-resort hint.
 * 4. Default to dev.
 */
export function resolveProfile(): BuildProfile {
  const explicit = process.env.APP_PROFILE?.toLowerCase()
  if (explicit === 'prod' || explicit === 'production') return prodProfile
  if (explicit === 'dev' || explicit === 'development') return devProfile

  const script = process.env.npm_lifecycle_event
  if (script === 'package' || script === 'make' || script === 'publish') {
    return prodProfile
  }

  if (process.env.NODE_ENV === 'production') return prodProfile

  return devProfile
}
