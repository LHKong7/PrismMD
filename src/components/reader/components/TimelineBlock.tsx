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
        className="absolute left-[5px] top-2 bottom-2 w-0.5"
        style={{ backgroundColor: 'var(--border-color)' }}
      />

      {items.map((item, i) => (
        <div key={i} className="relative mb-6 last:mb-0">
          {/* Dot — accent with a paper ring so it sits on the rule cleanly */}
          <div
            className="absolute -left-6 top-1 w-3 h-3 rounded-full"
            style={{
              backgroundColor: 'var(--accent-color)',
              boxShadow: '0 0 0 4px var(--paper, var(--bg-primary))',
            }}
          />

          {/* Label */}
          <div
            className="mb-1 uppercase font-semibold"
            style={{ color: 'var(--accent-color)', fontFamily: 'var(--font-ui)', fontSize: 11, letterSpacing: '0.06em' }}
          >
            {labels[i] ?? `Step ${i + 1}`}
          </div>

          {/* Content */}
          <div
            style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-read)', fontSize: 15, lineHeight: 1.55 }}
          >
            {item}
          </div>
        </div>
      ))}
    </div>
  )
}
