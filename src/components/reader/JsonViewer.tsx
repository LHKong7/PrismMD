import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle } from 'lucide-react'
// @ts-expect-error — `react-json-view` is an older package without TS types
// published for React 18. It still renders correctly; we wrap it below.
import ReactJson from 'react-json-view'
import { useFileStore } from '../../store/fileStore'

/**
 * JsonViewer — collapsible tree view of the currently-open JSON file.
 *
 * We parse lazily inside a `useMemo` so flipping between files doesn't
 * re-parse on every render. Invalid JSON shows a contextual error banner
 * and the raw text as a <pre> — useful when the user wants to debug a
 * malformed file without opening another tool.
 */
export function JsonViewer() {
  const { t } = useTranslation()
  const content = useFileStore((s) => s.currentContent)

  // react-json-view exposes a single `theme` prop; we follow the app's
  // light/dark state by observing the `dark` class on the root element
  // (ThemeProvider toggles it there).
  const [isDark, setIsDark] = useState(() =>
    typeof document !== 'undefined' &&
    document.documentElement.classList.contains('dark'),
  )
  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    const update = () => setIsDark(root.classList.contains('dark'))
    const obs = new MutationObserver(update)
    obs.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  const parsed = useMemo(() => {
    if (!content) return { ok: false as const, error: 'empty' }
    try {
      return { ok: true as const, value: JSON.parse(content) as unknown }
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }, [content])

  if (!parsed.ok) {
    return (
      <div className="h-full overflow-auto p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div
          className="flex items-start gap-2 mb-4 p-3 rounded border text-sm"
          style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
        >
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5 text-red-500" />
          <div>
            <div className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
              {t('reader.json.parseError')}
            </div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {parsed.error}
            </div>
          </div>
        </div>
        <pre
          className="text-xs font-mono whitespace-pre-wrap break-all"
          style={{ color: 'var(--text-secondary)' }}
        >
          {content}
        </pre>
      </div>
    )
  }

  const rjvTheme = isDark ? 'monokai' : 'rjv-default'

  return (
    <div
      className="h-full overflow-auto p-4"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <ReactJson
        src={parsed.value as object}
        theme={rjvTheme}
        name={null}
        collapsed={2}
        displayDataTypes={false}
        displayObjectSize
        enableClipboard
        iconStyle="triangle"
        style={{
          backgroundColor: 'transparent',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          fontSize: 12,
        }}
      />
    </div>
  )
}
