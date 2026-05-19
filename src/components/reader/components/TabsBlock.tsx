import { useState, Children, type ReactNode, type ReactElement } from 'react'

interface Props {
  'data-labels'?: string
  children?: ReactNode
}

export function TabsBlock(props: Props) {
  const labelsRaw = props['data-labels']
  let labels: string[] = []
  try {
    labels = labelsRaw ? JSON.parse(labelsRaw) : []
  } catch {
    labels = []
  }

  const [activeIdx, setActiveIdx] = useState(0)

  // Children are the tab-item elements
  const items = Children.toArray(props.children) as ReactElement[]

  if (labels.length === 0 || items.length === 0) {
    return <div>{props.children}</div>
  }

  return (
    <div className="tabs-block my-4 rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border-color)' }}>
      {/* Tab bar */}
      <div
        className="flex border-b"
        style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}
      >
        {labels.map((label, i) => (
          <button
            key={i}
            onClick={() => setActiveIdx(i)}
            className="px-4 py-2 text-xs font-medium transition-colors relative"
            style={{
              color: i === activeIdx ? 'var(--accent-color)' : 'var(--text-muted)',
              backgroundColor: i === activeIdx ? 'var(--bg-primary)' : 'transparent',
            }}
          >
            {label}
            {i === activeIdx && (
              <div
                className="absolute bottom-0 left-0 right-0 h-0.5"
                style={{ backgroundColor: 'var(--accent-color)' }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Active panel */}
      <div className="p-4 text-sm" style={{ color: 'var(--text-primary)' }}>
        {items[activeIdx] ?? items[0]}
      </div>
    </div>
  )
}
