import { CONSOLE_SHIM_SCRIPT } from './consoleShim'

/**
 * Builds the srcdoc HTML string for a sandboxed iframe based on language.
 */
export function buildSrcdoc(code: string, language: string): string {
  const lang = language.toLowerCase()
  const shimScript = `<script>${CONSOLE_SHIM_SCRIPT}<\/script>`

  if (lang === 'html') {
    // If the code already contains <html> or <body>, inject shim into head area
    if (code.includes('<html') || code.includes('<head')) {
      return code.replace(
        /(<head[^>]*>)/i,
        `$1${shimScript}`,
      )
    }
    // Otherwise wrap in a full document
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
${shimScript}
<style>body { font-family: system-ui, sans-serif; margin: 8px; }</style>
</head>
<body>
${code}
</body>
</html>`
  }

  if (lang === 'css') {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
${shimScript}
<style>${code}</style>
</head>
<body>
<div class="preview">
  <h1>Preview</h1>
  <p>This is a paragraph to preview your CSS styles.</p>
  <button>Button</button>
  <ul><li>Item 1</li><li>Item 2</li><li>Item 3</li></ul>
</div>
</body>
</html>`
  }

  // javascript / js
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
${shimScript}
</head>
<body>
<pre id="output"></pre>
<script>
try {
${code}
} catch(e) {
  console.error(e.message || String(e));
}
<\/script>
</body>
</html>`
}
