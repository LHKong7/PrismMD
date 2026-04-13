import type { ForgeConfig } from '@electron-forge/shared-types'
import { VitePlugin } from '@electron-forge/plugin-vite'
import { appConfig } from './app.config'
import { resolveProfile } from './build-config/profiles'

/**
 * Electron Forge configuration.
 *
 * App identity (name, bundle id, icon, file associations, …) is shared
 * across every run. Anything that legitimately varies between
 * `npm run dev` and `npm run package` / `npm run make` is pulled from the
 * active build profile. See `build-config/profiles.ts`.
 */
const profile = resolveProfile()

// Surface the active profile once at config-load so it's obvious which
// variant Forge is about to use.
// eslint-disable-next-line no-console
console.log(`[forge] active build profile: ${profile.name}`)

const config: ForgeConfig = {
  packagerConfig: {
    appBundleId: appConfig.appBundleId,
    name: appConfig.name,
    executableName: appConfig.executableName,
    ...(appConfig.icon ? { icon: appConfig.icon } : {}),
    extendInfo: {
      CFBundleDocumentTypes: [
        {
          CFBundleTypeName: 'Markdown',
          CFBundleTypeRole: 'Viewer',
          LSItemContentTypes: ['net.daringfireball.markdown'],
          CFBundleTypeExtensions: ['md', 'markdown'],
        },
      ],
    },
    // Profile-specific overrides win over any shared defaults above.
    ...profile.packagerOverrides,
  },
  makers: profile.makers,
  outDir: profile.outDir,
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'electron/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'electron/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
  ],
}

export default config
