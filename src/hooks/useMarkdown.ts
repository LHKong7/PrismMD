import { useState, useEffect } from 'react'
import type { ReactElement } from 'react'
import { processMarkdown, type MarkdownResult } from '../lib/markdown/pipeline'
import type { TocEntry } from '../lib/markdown/remarkToc'
import { useFileStore } from '../store/fileStore'

interface UseMarkdownResult {
  content: ReactElement | null
  toc: TocEntry[]
  isProcessing: boolean
}

export function useMarkdown(source: string | null): UseMarkdownResult {
  const [result, setResult] = useState<MarkdownResult | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const setToc = useFileStore((s) => s.setToc)

  useEffect(() => {
    if (!source) {
      setResult(null)
      setToc([])
      return
    }

    let cancelled = false
    setIsProcessing(true)

    processMarkdown(source).then((res) => {
      if (!cancelled) {
        setResult(res)
        setToc(res.toc)
        setIsProcessing(false)
      }
    }).catch((err) => {
      console.error('Markdown processing error:', err)
      if (!cancelled) {
        setIsProcessing(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [source, setToc])

  return {
    content: result?.content ?? null,
    toc: result?.toc ?? [],
    isProcessing,
  }
}
