import type { ForgeConfig } from '@electron-forge/shared-types'
import { VitePlugin } from '@electron-forge/plugin-vite'
import { MakerDMG } from '@electron-forge/maker-dmg'
import { MakerZIP } from '@electron-forge/maker-zip'
import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { MakerDeb } from '@electron-forge/maker-deb'

const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      unpack: '**/node_modules/{chokidar,fsevents}/**',
    },
    appBundleId: 'com.prismmd.app',
    name: 'PrismMD',
    executableName: 'prismmd',
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
  },
  makers: [
    new MakerDMG({}),
    new MakerZIP({}, ['darwin']),
    new MakerSquirrel({ name: 'PrismMD' }),
    new MakerDeb({
      options: {
        categories: ['Utility'],
        mimeType: ['text/markdown'],
      },
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
