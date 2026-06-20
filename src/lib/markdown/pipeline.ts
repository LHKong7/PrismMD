import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import remarkMath from 'remark-math'
import remarkRehype from 'remark-rehype'
import rehypeSlug from 'rehype-slug'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import rehypeReact from 'rehype-react'
import { Fragment } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'
import type { ReactElement } from 'react'
import { remarkToc, type TocEntry } from './remarkToc'
import { remarkCjkSpacing } from './remarkCjkSpacing'
import { remarkCodeAnalysis, type CodeBlockMarker } from './remarkCodeAnalysis'
import { remarkEnhanced } from './remarkEnhanced'
import { CodeBlock } from '../../components/reader/components/CodeBlock'
import { MermaidBlock } from '../../components/reader/components/MermaidBlock'
import { TableBlock } from '../../components/reader/components/TableBlock'
import { Callout } from '../../components/reader/components/Callout'
import { TabsBlock } from '../../components/reader/components/TabsBlock'
import { TimelineBlock } from '../../components/reader/components/TimelineBlock'

export interface MarkdownResult {
  content: ReactElement
  toc: TocEntry[]
  codeMarkers: CodeBlockMarker[]
}

export async function processMarkdown(source: string): Promise<MarkdownResult> {
  const toc: TocEntry[] = []
  const codeMarkers: CodeBlockMarker[] = []

  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkBreaks)
    .use(remarkMath)
    .use(remarkCjkSpacing)
    .use(remarkToc, { onExtract: (entries: TocEntry[]) => { toc.push(...entries) } })
    .use(remarkCodeAnalysis, { onExtract: (markers: CodeBlockMarker[]) => { codeMarkers.push(...markers) } })
    .use(remarkEnhanced)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeSlug)
    .use(rehypeKatex)
    // Reader-side syntax highlighting; token classes are mapped to the Prism
    // palette in markdown.css. detect=true highlights unlabeled blocks too.
    .use(rehypeHighlight, { detect: true, ignoreMissing: true })
    // @ts-expect-error rehype-react types are complex
    .use(rehypeReact, {
      jsx,
      jsxs,
      Fragment,
      components: {
        pre: CodeBlock,
        table: TableBlock,
        callout: Callout,
        'tabs-container': TabsBlock,
        'timeline-container': TimelineBlock,
      },
    })
    .process(source)

  return {
    content: result.result as ReactElement,
    toc,
    codeMarkers,
  }
}
