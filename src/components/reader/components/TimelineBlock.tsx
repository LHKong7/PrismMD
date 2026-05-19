import { Children, type ReactNode, type ReactElement } from 'react'

interface Props {
  'data-labels'?: string
  children?: ReactNode
}

export function TimelineBlock(props: Props) {
  const labelsRaw = props['data-labels']
  let labels: string[] = []
  try {
    labels = labelsRaw ? JSON.parse(labelsRaw) : []
  } catch {
    labels = []
  }

  const items = Children.toArray(props.children) as ReactElement[]

  if (items.length === 0) {
    return <div>{props.children}</div>
  }

  return (
    <div className="timeline-block my-6 pl-6 relative">
      {/* Vertical line */}
      <div
        className="absolute left-[11px] top-2 bottom-2 w-0.5"
        style={{ backgroundColor: 'var(--border-color)' }}
      />

      {items.map((item, i) => (
        <div key={i} className="relative mb-6 last:mb-0">
          {/* Dot */}
          <div
            className="absolute -left-6 top-1 w-3 h-3 rounded-full border-2"
            style={{
              borderColor: 'var(--accent-color)',
              backgroundColor: i === 0 ? 'var(--accent-color)' : 'var(--bg-primary)',
            }}
          />

          {/* Label */}
          <div
            className="text-xs font-semibold mb-1"
            style={{ color: 'var(--accent-color)' }}
          >
            {labels[i] ?? `Step ${i + 1}`}
          </div>

          {/* Content */}
          <div
            className="text-sm"
            style={{ color: 'var(--text-secondary)' }}
          >
            {item}
          </div>
        </div>
      ))}
    </div>
  )
}
