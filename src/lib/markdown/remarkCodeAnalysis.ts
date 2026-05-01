import { visit } from 'unist-util-visit'
import type { Root, Code } from 'mdast'
import type { Plugin } from 'unified'

export type CodeBlockStatus = 'ok' | 'broken' | 'empty'

export interface CodeBlockMarker {
  /** Zero-based index matching the data-code-block-index attribute. */
  index: number
  status: CodeBlockStatus
  language: string
  startLine: number
  endLine: number
}

interface RemarkCodeAnalysisOptions {
  onExtract: (markers: CodeBlockMarker[]) => void
}

/** Cheap brace/bracket balance check for JS-family languages. */
function hasMismatchedBraces(code: string): boolean {
  let braces = 0
  let brackets = 0
  let parens = 0
  let inString: string | null = null

  for (let i = 0; i < code.length; i++) {
    const ch = code[i]
    const prev = i > 0 ? code[i - 1] : ''

    if (inString) {
      if (ch === inString && prev !== '\\') inString = null
      continue
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch
      continue
    }

    if (ch === '{') braces++
    else if (ch === '}') braces--
    else if (ch === '[') brackets++
    else if (ch === ']') brackets--
    else if (ch === '(') parens++
    else if (ch === ')') parens--
  }

  return braces !== 0 || brackets !== 0 || parens !== 0
}

function classifyCodeBlock(node: Code): CodeBlockStatus {
  const body = node.value ?? ''

  // Empty check
  if (body.trim().length === 0) return 'empty'

  const lang = (node.lang ?? '').toLowerCase()

  // JSON validation
  if (lang === 'json') {
    try {
      JSON.parse(body)
    } catch {
      return 'broken'
    }
  }

  // Brace balance for JS-family
  if (['js', 'javascript', 'ts', 'typescript', 'jsx', 'tsx'].includes(lang)) {
    if (hasMismatchedBraces(body)) return 'broken'
  }

  return 'ok'
}

/**
 * Remark plugin that visits all fenced code blocks, classifies them,
 * and injects `data-code-block-index` via hProperties for DOM lookup.
 */
export const remarkCodeAnalysis: Plugin<[RemarkCodeAnalysisOptions], Root> = (options) => {
  return (tree) => {
    const markers: CodeBlockMarker[] = []
    let index = 0

    visit(tree, 'code', (node: Code) => {
      const currentIndex = index++
      const status = classifyCodeBlock(node)

      markers.push({
        index: currentIndex,
        status,
        language: node.lang ?? '',
        startLine: node.position?.start.line ?? 0,
        endLine: node.position?.end.line ?? 0,
      })

      // Inject data attribute for DOM lookup.
      // remark-rehype reads hProperties from the node's data field.
      if (!node.data) node.data = {}
      const hProps = (node.data.hProperties ?? {}) as Record<string, unknown>
      hProps['data-code-block-index'] = String(currentIndex)
      node.data.hProperties = hProps
    })

    options.onExtract(markers)
  }
}
