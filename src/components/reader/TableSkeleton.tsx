/**
 * TableSkeleton — placeholder shown while CsvViewer / XlsxViewer parse
 * a large file. The animated rows give the user a clear "we're working
 * on it" cue instead of staring at a frozen frame while the main thread
 * is busy in papaparse / SheetJS.
 *
 * Lives next to the table viewers since it's only meaningful for them;
 * promoting to `components/ui` would be premature.
 */
export function TableSkeleton({ label }: { label: string }) {
  return (
    <div
      className="h-full w-full flex flex-col"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div
        className="px-3 py-1.5 text-[10px] border-b flex items-center gap-2"
        style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}
      >
        <span
          className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
          style={{ backgroundColor: 'var(--accent-color)' }}
        />
        {label}
      </div>
      <div className="flex-1 p-3 space-y-2 overflow-hidden">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="h-5 rounded animate-pulse"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              // Stagger the widths so the placeholder reads as tabular
              // data rather than a solid block.
              width: `${85 - (i % 4) * 10}%`,
              opacity: 1 - i * 0.05,
            }}
          />
        ))}
      </div>
    </div>
  )
}
