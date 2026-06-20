import { useState } from 'react'
import { Plus, Pencil, Trash2, X, Check, FileStack } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTemplateStore, type Template } from '../../store/templateStore'

export function TemplateSettings() {
  const { t } = useTranslation()
  const templates = useTemplateStore((s) => s.templates)
  const addTemplate = useTemplateStore((s) => s.addTemplate)
  const updateTemplate = useTemplateStore((s) => s.updateTemplate)
  const deleteTemplate = useTemplateStore((s) => s.deleteTemplate)

  const [editing, setEditing] = useState<string | null>(null) // template id or 'new'
  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formContent, setFormContent] = useState('')

  const startNew = () => {
    setEditing('new')
    setFormName('')
    setFormDesc('')
    setFormContent('')
  }

  const startEdit = (tpl: Template) => {
    setEditing(tpl.id)
    setFormName(tpl.name)
    setFormDesc(tpl.description)
    setFormContent(tpl.content)
  }

  const cancel = () => setEditing(null)

  const save = () => {
    if (!formName.trim()) return
    if (editing === 'new') {
      addTemplate(formName.trim(), formDesc.trim(), formContent)
    } else if (editing) {
      updateTemplate(editing, { name: formName.trim(), description: formDesc.trim(), content: formContent })
    }
    setEditing(null)
  }

  // Show form
  if (editing) {
    return (
      <div>
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
          {editing === 'new' ? t('settings.templates.newTitle') : t('settings.templates.editTitle')}
        </h3>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-secondary)' }}>
              {t('settings.templates.name')}
            </label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder={t('settings.templates.namePlaceholder')}
              className="w-full text-sm px-3 py-1.5 rounded border outline-none"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                borderColor: 'var(--border-color)',
                color: 'var(--text-primary)',
              }}
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-secondary)' }}>
              {t('settings.templates.description')}
            </label>
            <input
              type="text"
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              placeholder={t('settings.templates.descPlaceholder')}
              className="w-full text-sm px-3 py-1.5 rounded border outline-none"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                borderColor: 'var(--border-color)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-secondary)' }}>
              {t('settings.templates.content')}
            </label>
            <textarea
              value={formContent}
              onChange={(e) => setFormContent(e.target.value)}
              placeholder={t('settings.templates.contentPlaceholder')}
              rows={12}
              className="w-full text-xs px-3 py-2 rounded border outline-none resize-y font-mono"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                borderColor: 'var(--border-color)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          <div className="flex gap-2 justify-end">
            <button
              onClick={cancel}
              className="flex items-center gap-1 px-3 py-1.5 rounded text-xs transition-colors"
              style={{ color: 'var(--text-muted)' }}
            >
              <X size={12} />
              {t('settings.templates.cancel')}
            </button>
            <button
              onClick={save}
              disabled={!formName.trim()}
              className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium transition-colors disabled:opacity-40"
              style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-ink, #fff)' }}
            >
              <Check size={12} />
              {t('settings.templates.save')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Template list
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          {t('settings.templates.title')}
        </h3>
        <button
          onClick={startNew}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors"
          style={{ color: 'var(--accent-color)' }}
        >
          <Plus size={12} />
          {t('settings.templates.new')}
        </button>
      </div>
      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
        {t('settings.templates.description_setting')}
      </p>

      {templates.length === 0 && (
        <div className="rounded-lg border p-6 text-center" style={{ borderColor: 'var(--border-color)' }}>
          <FileStack size={24} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {t('settings.templates.empty')}
          </p>
        </div>
      )}

      <div className="space-y-2">
        {templates.map((tpl) => (
          <div
            key={tpl.id}
            className="group flex items-start gap-3 rounded-lg border p-3"
            style={{ borderColor: 'var(--border-color)' }}
          >
            <FileStack size={14} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--accent-color)' }} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                {tpl.name}
              </div>
              {tpl.description && (
                <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {tpl.description}
                </p>
              )}
              <p className="text-[10px] mt-1 font-mono truncate" style={{ color: 'var(--text-muted)' }}>
                {tpl.content.slice(0, 80).replace(/\n/g, ' ')}...
              </p>
            </div>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => startEdit(tpl)}
                className="p-1 rounded transition-colors hover:bg-black/10 dark:hover:bg-white/10"
                title={t('settings.templates.edit')}
              >
                <Pencil size={12} style={{ color: 'var(--text-muted)' }} />
              </button>
              <button
                onClick={() => deleteTemplate(tpl.id)}
                className="p-1 rounded transition-colors hover:bg-black/10 dark:hover:bg-white/10"
                title={t('settings.templates.delete')}
              >
                <Trash2 size={12} style={{ color: 'var(--text-muted)' }} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
