import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import remarkMath from 'remark-math'
import remarkRehype from 'remark-rehype'
import rehypeSlug from 'rehype-slug'
import rehypeKatex from 'rehype-katex'
import rehypeStringify from 'rehype-stringify'
import { remarkCjkSpacing } from '../markdown/remarkCjkSpacing'
import type { Root as HastRoot } from 'hast'

/**
 * Convert markdown source to an HTML string.
 * Uses the same remark/rehype pipeline as the reader but outputs
 * a raw HTML string via rehype-stringify instead of React elements.
 */
export async function markdownToHtml(source: string): Promise<string> {
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkBreaks)
    .use(remarkMath)
    .use(remarkCjkSpacing)
    .use(remarkRehype, { allowDangerousHtml: false })
    .use(rehypeSlug)
    .use(rehypeKatex)
    .use(rehypeStringify)
    .process(source)

  return String(result)
}

/**
 * Convert markdown source to a rehype HAST tree (for DOCX conversion).
 */
export async function markdownToHast(source: string): Promise<HastRoot> {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkBreaks)
    .use(remarkMath)
    .use(remarkCjkSpacing)
    .use(remarkRehype, { allowDangerousHtml: false })
    .use(rehypeSlug)
    .use(rehypeKatex)

  const mdast = processor.parse(source)
  const hast = await processor.run(mdast)
  return hast as HastRoot
}
