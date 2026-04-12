import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { appConfig } from './app.config'

export default defineConfig({
  plugins: [
    react(),
    {
      // Inject app name into index.html at build time
      name: 'app-config-html',
      transformIndexHtml(html) {
        return html
          .replace(/<title>.*<\/title>/, `<title>${appConfig.name}</title>`)
          .replace(/__APP_NAME__/g, appConfig.name)
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  define: {
    __APP_NAME__: JSON.stringify(appConfig.name),
  },
})
