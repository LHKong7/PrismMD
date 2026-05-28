import { useState } from 'react'
import { RotateCcw, ChevronDown, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { usePromptConfigStore, type PromptConfig, type PromptMode } from '../../store/promptConfigStore'

export function PromptSettings() {
  const { t } = useTranslation()
  const configs = usePromptConfigStore((s) => s.getAllConfigs)()
  const setPrompt = usePromptConfigStore((s) => s.setPrompt)
  const resetPrompt = usePromptConfigStore((s) => s.resetPrompt)

  const [expandedMode, setExpandedMode] = useState<PromptMode | null>(null)

  return (
    <div>
      <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
        {t('settings.prompts.title', 'Agent Prompts')}
      </h3>
      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
        {t('settings.prompts.description', 'Customize the system prompts for each AI mode. Leave empty to use the default.')}
      </p>

      <div className="space-y-1">
        {configs.map((config) => (
          <PromptItem
            key={config.mode}
            config={config}
            expanded={expandedMode === config.mode}
            onToggle={() => setExpandedMode(expandedMode === config.mode ? null : config.mode)}
            onSave={(prompt) => setPrompt(config.mode, prompt)}
            onReset={() => resetPrompt(config.mode)}
          />
        ))}
      </div>
    </div>
  )
}

function PromptItem({ config, expanded, onToggle, onSave, onReset }: {
  config: PromptConfig
  expanded: boolean
  onToggle: () => void
  onSave: (prompt: string) => void
  onReset: () => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(config.userPrompt || config.defaultPrompt)
  const isCustomized = !!config.userPrompt.trim()

  const handleExpand = () => {
    if (!expanded) {
      setDraft(config.userPrompt || config.defaultPrompt)
    }
    onToggle()
  }

  const handleSave = () => {
    // If the draft matches the default, treat as "reset to default"
    if (draft.trim() === config.defaultPrompt.trim()) {
      onReset()
    } else {
      onSave(draft)
    }
  }

  const handleReset = () => {
    setDraft(config.defaultPrompt)
    onReset()
  }

  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{ borderColor: expanded ? 'var(--accent-color)' : 'var(--border-color)' }}
    >
      {/* Header */}
      <button
        onClick={handleExpand}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5"
      >
        {expanded ? (
          <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} />
        ) : (
          <ChevronRight size={13} style={{ color: 'var(--text-muted)' }} />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
              {config.label}
            </span>
            {isCustomized && (
              <span
                className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                style={{ backgroundColor: 'var(--color-info-bg)', color: 'var(--color-info)' }}
              >
                {t('settings.prompts.customized', 'Customized')}
              </span>
            )}
          </div>
          <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
            {config.description}
          </p>
        </div>
      </button>

      {/* Expanded editor */}
      {expanded && (
        <div className="px-3 pb-3 border-t" style={{ borderColor: 'var(--border-color)' }}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={8}
            className="w-full mt-2 text-xs px-3 py-2 rounded border outline-none resize-y font-mono"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              borderColor: 'var(--border-color)',
              color: 'var(--text-primary)',
            }}
          />
          <div className="flex items-center justify-between mt-2">
            <button
              onClick={handleReset}
              className="flex items-center gap-1 text-[11px] transition-colors hover:opacity-80"
              style={{ color: 'var(--text-muted)' }}
            >
              <RotateCcw size={11} />
              {t('settings.prompts.resetDefault', 'Reset to default')}
            </button>
            <button
              onClick={handleSave}
              className="px-3 py-1 rounded text-[11px] font-medium transition-colors"
              style={{ backgroundColor: 'var(--accent-color)', color: '#fff' }}
            >
              {t('settings.prompts.save', 'Save')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
