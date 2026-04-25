import { useTranslation } from 'react-i18next'
import { useFileStore } from '../../store/fileStore'
import { Dialog } from '../ui/Dialog'
import { Button } from '../ui/Button'

export function DeleteConfirmDialog() {
  const { t } = useTranslation()
  const pendingDelete = useFileStore((s) => s.pendingDelete)
  const deleteItem = useFileStore((s) => s.deleteItem)
  const cancelDelete = useFileStore((s) => s.cancelDelete)

  if (!pendingDelete) return null

  return (
    <Dialog
      open
      onClose={cancelDelete}
      ariaLabel={t('filetree.deleteConfirmTitle', { name: pendingDelete.name })}
      title={t('filetree.deleteConfirmTitle', { name: pendingDelete.name })}
      widthClass="max-w-sm"
    >
      <div className="px-5 py-4">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {pendingDelete.isDirectory
            ? t('filetree.deleteConfirmFolder')
            : t('filetree.deleteConfirmFile')}
        </p>
      </div>
      <div
        className="flex items-center justify-end gap-2 px-5 py-3 border-t"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <Button variant="outline" size="md" onClick={cancelDelete}>
          {t('filetree.cancel')}
        </Button>
        <Button variant="danger" size="md" onClick={() => void deleteItem()}>
          {t('filetree.deleteConfirmButton')}
        </Button>
      </div>
    </Dialog>
  )
}
