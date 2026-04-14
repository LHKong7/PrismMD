import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { bootstrapBuiltinPlugins } from './lib/plugins/loader'
import './styles/index.css'
import 'katex/dist/katex.min.css'

// Fire built-in plugins before the app mounts so commands, sidebar panels
// and markdown renderers exist by the time the first render happens.
// External on-disk plugins are bootstrapped later (after the main process
// is ready to read <userData>/plugins) from inside the App tree.
void bootstrapBuiltinPlugins()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
