import { forwardRef, type SelectHTMLAttributes } from 'react'
import { clsx } from 'clsx'

/**
 * Thin wrapper over the native `<select>` so pickers across the app share
 * border, focus ring, and disabled styling. We stay native because:
 *  - Electron renders OS-native dropdown popups which handle a11y/keyboard
 *    correctly out of the box.
 *  - The project already uses native selects in SettingsPanel and
 *    AgentSidebar — swapping to a custom combobox would be disruptive and
 *    introduce its own a11y surface to audit.
 */
export type SelectSize = 'sm' | 'md'

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  selectSize?: SelectSize
}

const SIZE_CLASSES: Record<SelectSize, string> = {
  sm: 'px-2 py-1 text-xs rounded',
  md: 'px-3 py-2 text-sm rounded-md',
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { selectSize = 'md', className, style, children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={clsx(
        'w-full border bg-transparent outline-none transition-colors',
        'text-[var(--text-primary)]',
        'focus:border-[var(--accent-color)]',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        SIZE_CLASSES[selectSize],
        className,
      )}
      style={{
        borderColor: 'var(--border-color)',
        backgroundColor: 'var(--bg-primary)',
        ...style,
      }}
      {...rest}
    >
      {children}
    </select>
  )
})
