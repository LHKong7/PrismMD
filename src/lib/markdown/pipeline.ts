import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkRehype from 'remark-rehype'
import rehypeSlug from 'rehype-slug'
import rehypeKatex from 'rehype-katex'
import rehypeReact from 'rehype-react'
import { createElement, Fragment } from 'react'
import type { ReactElement } from 'react'
import { remarkToc, type TocEntry } from './remarkToc'
import { remarkCjkSpacing } from './remarkCjkSpacing'
import { CodeBlock } from '../../components/reader/components/CodeBlock'
import { MermaidBlock } from '../../components/reader/components/MermaidBlock'
import { TableBlock } from '../../components/reader/components/TableBlock'

export interface MarkdownResult {
  content: ReactElement
  toc: TocEntry[]
}

export async function processMarkdown(source: string): Promise<MarkdownResult> {
  const toc: TocEntry[] = []

  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkCjkSpacing)
    .use(remarkToc, { onExtract: (entries: TocEntry[]) => { toc.push(...entries) } })
    .use(remarkRehype, { allowDangerousHtml: false })
    .use(rehypeSlug)
    .use(rehypeKatex)
    // @ts-expect-error rehype-react types are complex
    .use(rehypeReact, {
      createElement,
      Fragment,
      components: {
        pre: CodeBlock,
        table: TableBlock,
      },
    })
    .process(source)

  return {
    content: result.result as ReactElement,
    toc,
  }
}
