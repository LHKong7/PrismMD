import { getThemeById } from '../theme/themes'
import markdownCss from '../../styles/markdown.css?raw'
import katexCss from 'katex/dist/katex.min.css?raw'

/**
 * Wrap an HTML body fragment in a complete standalone HTML document
 * with inlined theme CSS variables, markdown styles, and KaTeX styles.
 */
export function buildStandaloneHtml(
  bodyHtml: string,
  themeId: string,
  title: string,
): string {
  const theme = getThemeById(themeId)
  const colors = theme?.colors ?? {}

  // Build :root CSS variables from the theme
  const cssVars = Object.entries(colors)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(title)}</title>
<style>
:root {
${cssVars}
}
body {
  margin: 0;
  padding: 0;
  background-color: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--font-body, 'Inter', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif);
}
${katexCss}
${markdownCss}
/* Print-friendly overrides */
@media print {
  body { background: white; }
  .markdown-body {
    max-width: 100%;
    padding: 0;
    margin: 0;
  }
  pre, table, blockquote, figure, .katex-display {
    page-break-inside: avoid;
  }
  h1, h2, h3, h4, h5, h6 {
    page-break-after: avoid;
  }
}
</style>
</head>
<body>
<div class="markdown-body">
${bodyHtml}
</div>
</body>
</html>`
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
