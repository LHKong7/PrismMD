import type { ForgeConfig } from '@electron-forge/shared-types'
import { VitePlugin } from '@electron-forge/plugin-vite'
import { MakerDMG } from '@electron-forge/maker-dmg'
import { MakerZIP } from '@electron-forge/maker-zip'
import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { MakerDeb } from '@electron-forge/maker-deb'
import { appConfig } from './app.config'

const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      unpack: '**/node_modules/{chokidar,fsevents}/**',
    },
    appBundleId: appConfig.appBundleId,
    name: appConfig.name,
    executableName: appConfig.executableName,
    appCopyright: `Copyright © ${new Date().getFullYear()} ${appConfig.name}`,
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
  },
  makers: [
    new MakerDMG({
      ...(appConfig.icon ? { icon: `${appConfig.icon}.icns` } : {}),
    }),
    new MakerZIP({}, ['darwin']),
    new MakerSquirrel({
      name: appConfig.name,
      ...(appConfig.icon ? { iconUrl: `${appConfig.icon}.ico`, setupIcon: `${appConfig.icon}.ico` } : {}),
    }),
    new MakerDeb({
      options: {
        categories: ['Utility'],
        mimeType: ['text/markdown'],
        ...(appConfig.icon ? { icon: `${appConfig.icon}.png` } : {}),
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
