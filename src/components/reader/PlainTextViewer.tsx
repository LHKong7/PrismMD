import { usePaneFileData } from '../../hooks/usePaneFileData'

/**
 * PlainTextViewer — read-only rendering of a text document.
 *
 * Used for `.txt`/`.log` pages in the inactive split pane (the active pane
 * gets the real CodeMirror editor). Deliberately dumb: no syntax highlight,
 * no wrapping tricks — a log file should look exactly like the file.
 */
export function PlainTextViewer() {
  const { content } = usePaneFileData()

  return (
    <div
      className="h-full overflow-auto px-6 py-4"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <pre
        className="text-xs leading-relaxed whitespace-pre-wrap break-words font-mono"
        style={{ color: 'var(--text-primary)' }}
      >
        {content ?? ''}
      </pre>
    </div>
  )
}
