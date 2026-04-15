import { useState, useEffect } from 'react'
import type { ReactElement } from 'react'
import { processMarkdown, type MarkdownResult } from '../lib/markdown/pipeline'
import type { TocEntry } from '../lib/markdown/remarkToc'
import { useFileStore } from '../store/fileStore'

interface UseMarkdownResult {
  content: ReactElement | null
  toc: TocEntry[]
  isProcessing: boolean
  error: string | null
}

export function useMarkdown(source: string | null): UseMarkdownResult {
  const [result, setResult] = useState<MarkdownResult | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const setToc = useFileStore((s) => s.setToc)

  useEffect(() => {
    if (!source) {
      setResult(null)
      setToc([])
      setError(null)
      return
    }

    let cancelled = false
    setIsProcessing(true)
    setError(null)

    processMarkdown(source).then((res) => {
      if (!cancelled) {
        setResult(res)
        setToc(res.toc)
        setIsProcessing(false)
      }
    }).catch((err) => {
      console.error('Markdown processing error:', err)
      if (!cancelled) {
        setError(err instanceof Error ? err.message : String(err))
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
    error,
  }
}
