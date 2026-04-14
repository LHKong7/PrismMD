import type { ForgeConfig } from '@electron-forge/shared-types'
import { VitePlugin } from '@electron-forge/plugin-vite'
import { PublisherGithub } from '@electron-forge/publisher-github'
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
  // Publisher is only consulted by `npm run publish` — `package` / `make`
  // ignore it, so adding it has zero effect on local builds. Requires a
  // `GITHUB_TOKEN` env var (a personal access token with `repo` scope) at
  // publish time. `draft: true` means the release lands as a draft on
  // GitHub so we get a chance to review before it's visible to users.
  publishers: [
    new PublisherGithub({
      repository: {
        owner: 'lhkong7',
        name: 'prismmd',
      },
      draft: true,
      prerelease: false,
    }),
  ],
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
