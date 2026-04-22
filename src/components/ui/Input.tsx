import { forwardRef, type InputHTMLAttributes } from 'react'
import { clsx } from 'clsx'

/**
 * Shared text input primitive. Wraps the token-driven border/focus/invalid
 * styling that was previously duplicated across SettingsPanel forms (Neo4j
 * URI, memory clear, MCP JSON textarea, etc.).
 *
 * - `invalid` flips the border to the semantic error color; pair it with
 *   `aria-invalid` for screen-reader parity (we set it automatically here).
 * - `size` maps to the same scale as Button so an inline row of Button + Input
 *   visually lines up.
 */
export type InputSize = 'sm' | 'md'

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  invalid?: boolean
  inputSize?: InputSize
}

const SIZE_CLASSES: Record<InputSize, string> = {
  sm: 'px-2 py-1 text-xs rounded',
  md: 'px-3 py-2 text-sm rounded-md',
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, inputSize = 'md', className, style, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={clsx(
        'w-full border bg-transparent outline-none transition-colors',
        'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
        'focus:border-[var(--accent-color)]',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        SIZE_CLASSES[inputSize],
        className,
      )}
      style={{
        borderColor: invalid ? 'var(--color-error-border)' : 'var(--border-color)',
        ...style,
      }}
      {...rest}
    />
  )
})
