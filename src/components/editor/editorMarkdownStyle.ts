import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { EditorView } from '@codemirror/view'

/**
 * Custom highlight style that makes markdown tokens visually styled
 * in the editor — headings appear large, bold appears bold, etc.
 *
 * The raw markdown syntax characters remain visible and editable,
 * but the content between them gets visual treatment matching the
 * reader view.
 */
const markdownHighlightStyle = HighlightStyle.define([
  // Headings — progressive sizes matching the reader's h1–h6
  { tag: tags.heading1, fontSize: '1.8em', fontWeight: '700', color: 'var(--text-primary)' },
  { tag: tags.heading2, fontSize: '1.5em', fontWeight: '650', color: 'var(--text-primary)' },
  { tag: tags.heading3, fontSize: '1.25em', fontWeight: '600', color: 'var(--text-primary)' },
  { tag: tags.heading4, fontSize: '1.1em', fontWeight: '600', color: 'var(--text-primary)' },
  { tag: tags.heading5, fontSize: '1.05em', fontWeight: '600', color: 'var(--text-primary)' },
  { tag: tags.heading6, fontSize: '1em', fontWeight: '600', color: 'var(--text-secondary)' },

  // Inline emphasis
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through', color: 'var(--text-muted)' },

  // Code
  { tag: tags.monospace, fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Consolas, monospace", fontSize: '0.9em' },

  // Links
  { tag: tags.link, color: 'var(--accent-color)', textDecoration: 'underline' },
  { tag: tags.url, color: 'var(--text-muted)', fontSize: '0.9em' },

  // Blockquote markers
  { tag: tags.quote, color: 'var(--text-muted)', fontStyle: 'italic' },

  // List markers (-, *, 1.)
  { tag: tags.list, color: 'var(--accent-color)' },

  // Horizontal rule
  { tag: tags.contentSeparator, color: 'var(--border-color)' },

  // Markdown syntax characters (# ** * ~~) — muted so content stands out
  { tag: tags.processingInstruction, color: 'var(--text-muted)', fontSize: '0.85em' },
  { tag: tags.meta, color: 'var(--text-muted)' },

  // Label names in links [text](url)
  { tag: tags.labelName, color: 'var(--accent-color)' },
])

/**
 * Base theme for markdown-specific structural styling that can't be
 * achieved with HighlightStyle alone (e.g., backgrounds, borders).
 */
const markdownBaseTheme = EditorView.baseTheme({
  // Inline code background
  '.ͼ1 .tok-monospace': {
    backgroundColor: 'var(--code-bg)',
    padding: '1px 4px',
    borderRadius: '3px',
  },
})

/** Combined extensions for rich markdown editing styles. */
export const editorMarkdownStyleExtension = [
  syntaxHighlighting(markdownHighlightStyle, { fallback: true }),
  markdownBaseTheme,
]
