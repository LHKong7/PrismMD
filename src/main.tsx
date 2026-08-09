import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/index.css'
import 'katex/dist/katex.min.css'

/**
 * One renderer bundle, two app roots.
 *
 * `?mode=reader` (set by `createReaderWindow` in the main process) mounts the
 * standalone read-only reader; anything else mounts the workbench. Both roots
 * are imported dynamically so a reader window never parses the workspace
 * store, the editor, the plugin host or the Pixi front stage — that omission
 * is the whole reason reader windows are cheap to open.
 */
const isReaderWindow = new URLSearchParams(window.location.search).get('mode') === 'reader'

const root = ReactDOM.createRoot(document.getElementById('root')!)

if (isReaderWindow) {
  void import('./components/library/ReaderApp').then(({ default: ReaderApp }) => {
    root.render(
      <React.StrictMode>
        <ReaderApp />
      </React.StrictMode>,
    )
  })
} else {
  void Promise.all([import('./App'), import('./lib/plugins/loader')]).then(
    ([{ default: App }, { bootstrapBuiltinPlugins }]) => {
      // Fire built-in plugins before the app mounts so commands, sidebar
      // panels and markdown renderers exist by the time the first render
      // happens. External on-disk plugins are bootstrapped later (after the
      // main process is ready to read <userData>/plugins) from inside the
      // App tree.
      void bootstrapBuiltinPlugins()

      root.render(
        <React.StrictMode>
          <App />
        </React.StrictMode>,
      )
    },
  )
}
