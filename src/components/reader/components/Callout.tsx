import { useState, type ReactNode } from 'react'
import { Info, Lightbulb, AlertTriangle, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react'

const ICONS: Record<string, typeof Info> = {
  note: Info,
  info: Info,
  tip: Lightbulb,
  warning: AlertTriangle,
  danger: AlertCircle,
}

const COLORS: Record<string, { border: string; bg: string; icon: string }> = {
  note: { border: 'var(--color-info)', bg: 'var(--color-info-bg)', icon: 'var(--color-info)' },
  info: { border: 'var(--color-info)', bg: 'var(--color-info-bg)', icon: 'var(--color-info)' },
  tip: { border: 'var(--color-success)', bg: 'var(--color-success-bg)', icon: 'var(--color-success)' },
  warning: { border: 'var(--color-warning)', bg: 'var(--color-warning-bg)', icon: 'var(--color-warning)' },
  danger: { border: 'var(--color-error)', bg: 'var(--color-error-bg)', icon: 'var(--color-error)' },
}

interface Props {
  'data-type'?: string
  'data-title'?: string
  children?: ReactNode
}

export function Callout(props: Props) {
  const type = props['data-type'] ?? 'note'
  const title = props['data-title'] ?? type.charAt(0).toUpperCase() + type.slice(1)
  const [collapsed, setCollapsed] = useState(false)

  const Icon = ICONS[type] ?? Info
  const colors = COLORS[type] ?? COLORS.note

  return (
    <div
      className="callout my-6 rounded-xl border"
      style={{
        borderColor: `color-mix(in srgb, ${colors.border} 30%, var(--border-color))`,
        backgroundColor: `color-mix(in srgb, ${colors.border} 7%, var(--paper, var(--bg-primary)))`,
      }}
    >
      <div className="flex gap-3.5 px-[18px] py-4">
        {/* Solid icon chip — the design's callout signature */}
        <span
          className="flex-shrink-0 grid place-items-center rounded-lg"
          style={{ width: 24, height: 24, backgroundColor: colors.icon, color: 'var(--paper, #fff)' }}
        >
          <Icon size={14} />
        </span>
        <div className="flex-1 min-w-0">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center gap-2 text-left cursor-pointer select-none"
            style={{ color: 'var(--text-primary)' }}
          >
            <span className="flex-1 font-semibold" style={{ fontFamily: 'var(--font-ui)', fontSize: 13.5 }}>{title}</span>
            {collapsed ? <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />}
          </button>
          {!collapsed && (
            <div
              className="mt-1"
              style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-read)', fontSize: 15, lineHeight: 1.6 }}
            >
              {props.children}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
