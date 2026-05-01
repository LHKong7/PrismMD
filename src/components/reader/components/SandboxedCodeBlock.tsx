import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, X, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { buildSrcdoc } from '../../../lib/sandbox/buildSrcdoc'
import { SandboxConsole, type ConsoleEntry } from './SandboxConsole'

interface Props {
  code: string
  language: string
  onClose: () => void
}

export function SandboxedCodeBlock({ code, language, onClose }: Props) {
  const { t } = useTranslation()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([])
  const [iframeKey, setIframeKey] = useState(0)

  const srcdoc = buildSrcdoc(code, language)

  // Listen for console messages from the iframe
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (
        e.source === iframeRef.current?.contentWindow &&
        e.data?.type === 'sandbox-console'
      ) {
        const { level, args } = e.data as { level: ConsoleEntry['level']; args: string[] }
        setConsoleEntries((prev) => {
          if (prev.length >= 100) return prev
          return [...prev, { level, args, timestamp: Date.now() }]
        })
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [iframeKey])

  const handleRerun = useCallback(() => {
    setConsoleEntries([])
    setIframeKey((k) => k + 1)
  }, [])

  const handleClearConsole = useCallback(() => {
    setConsoleEntries([])
  }, [])

  return (
    <div
      className="rounded-lg overflow-hidden my-6 border"
      style={{
        backgroundColor: 'var(--code-bg)',
        borderColor: 'var(--border-color)',
      }}
    >
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-3 py-1.5 border-b"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderColor: 'var(--border-color)',
        }}
      >
        <div className="flex items-center gap-2">
          <Play size={12} style={{ color: 'var(--color-success)' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            {language}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleRerun}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors hover:opacity-80"
            style={{ color: 'var(--text-secondary)' }}
            title={t('sandbox.rerun')}
          >
            <RotateCcw size={11} />
            {t('sandbox.rerun')}
          </button>
          <button
            onClick={onClose}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors hover:opacity-80"
            style={{ color: 'var(--text-muted)' }}
            title={t('sandbox.close')}
          >
            <X size={11} />
            {t('sandbox.close')}
          </button>
        </div>
      </div>

      {/* Split view: code + preview */}
      <div className="grid grid-cols-1 md:grid-cols-2">
        {/* Code panel */}
        <div
          className="overflow-auto border-r max-h-80"
          style={{ borderColor: 'var(--border-color)' }}
        >
          <pre className="p-3 text-xs font-mono whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
            <code>{code}</code>
          </pre>
        </div>

        {/* Preview panel */}
        <div className="flex flex-col">
          <iframe
            key={iframeKey}
            ref={iframeRef}
            sandbox="allow-scripts"
            srcDoc={srcdoc}
            className="w-full border-0"
            style={{
              minHeight: 200,
              maxHeight: 320,
              backgroundColor: '#fff',
            }}
            title="Sandbox preview"
          />
          <SandboxConsole entries={consoleEntries} onClear={handleClearConsole} />
        </div>
      </div>
    </div>
  )
}
