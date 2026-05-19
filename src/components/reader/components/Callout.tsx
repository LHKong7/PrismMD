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
      className="callout my-4 rounded-lg overflow-hidden"
      style={{
        borderLeft: `4px solid ${colors.border}`,
        backgroundColor: colors.bg,
      }}
    >
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left cursor-pointer select-none"
        style={{ color: colors.icon }}
      >
        <Icon size={16} className="flex-shrink-0" />
        <span className="text-sm font-semibold flex-1">{title}</span>
        {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
      </button>
      {!collapsed && (
        <div
          className="px-4 pb-3 text-sm"
          style={{ color: 'var(--text-primary)' }}
        >
          {props.children}
        </div>
      )}
    </div>
  )
}
