import { HighlightStyle, syntaxHighlighting, syntaxTree } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  WidgetType,
  type ViewUpdate,
} from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'

/**
 * Custom highlight style that makes markdown tokens visually styled
 * in the editor — headings appear large, bold appears bold, etc.
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

  // Markdown syntax characters — hidden via plugin below, but fallback muted style
  { tag: tags.processingInstruction, color: 'var(--text-muted)', fontSize: '0.85em' },
  { tag: tags.meta, color: 'var(--text-muted)' },

  // Label names in links [text](url)
  { tag: tags.labelName, color: 'var(--accent-color)' },
])

/**
 * Base theme for markdown-specific structural styling.
 */
const markdownBaseTheme = EditorView.baseTheme({
  '.ͼ1 .tok-monospace': {
    backgroundColor: 'var(--code-bg)',
    padding: '1px 4px',
    borderRadius: '3px',
  },
  '.cm-bullet': {
    color: 'var(--accent-color)',
    fontWeight: '700',
    fontSize: '1.2em',
    lineHeight: '1',
  },
})

// --- Syntax hiding plugin ---

/** Mark node names whose text should be visually hidden in rich mode. */
const HIDDEN_MARKS = new Set([
  'HeaderMark',        // # ## ### etc.
  'EmphasisMark',      // * or _ (italic/bold delimiters)
  'CodeMark',          // ` (inline code backticks)
  'StrikethroughMark', // ~~
  'QuoteMark',         // >
  'LinkMark',          // [ ] ( )
  'URL',               // the URL inside [text](url)
])

const hiddenDeco = Decoration.replace({})

/** Widget that renders a bullet dot in place of - or * list markers. */
class BulletWidget extends WidgetType {
  toDOM() {
    const span = document.createElement('span')
    span.textContent = '•'
    span.className = 'cm-bullet'
    span.setAttribute('aria-hidden', 'true')
    return span
  }

  eq() {
    return true
  }
}

const bulletDeco = Decoration.replace({ widget: new BulletWidget() })

/**
 * Build decorations that hide markdown syntax marks and replace
 * unordered list markers with bullet dots.
 * Marks on the cursor's line stay visible for editing.
 */
function buildHiddenDecos(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const state = view.state
  const tree = syntaxTree(state)
  const cursor = state.selection.main.head

  // Find the active line range
  const activeLine = state.doc.lineAt(cursor)
  const activeFrom = activeLine.from
  const activeTo = activeLine.to

  // Only scan the visible viewport for performance
  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter(node) {
        // Don't process marks on the cursor's line
        if (node.from >= activeFrom && node.to <= activeTo) {
          if (HIDDEN_MARKS.has(node.name) || node.name === 'ListMark') return
        }
        if (node.from >= node.to) return

        // Unordered list markers → replace with bullet
        if (node.name === 'ListMark') {
          const text = state.sliceDoc(node.from, node.to)
          // Only replace - and * (unordered); leave 1. 2. etc. (ordered) alone
          if (text.trim() === '-' || text.trim() === '*') {
            builder.add(node.from, node.to, bulletDeco)
          }
          return
        }

        // Regular syntax marks → hide entirely
        if (HIDDEN_MARKS.has(node.name)) {
          builder.add(node.from, node.to, hiddenDeco)
        }
      },
    })
  }

  return builder.finish()
}

const syntaxHidingPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildHiddenDecos(view)
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged
      ) {
        this.decorations = buildHiddenDecos(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
)

/** Combined extensions for rich markdown editing styles. */
export const editorMarkdownStyleExtension = [
  syntaxHighlighting(markdownHighlightStyle, { fallback: true }),
  markdownBaseTheme,
  syntaxHidingPlugin,
]
