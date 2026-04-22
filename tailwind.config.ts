import type { Config } from 'tailwindcss'
import typography from '@tailwindcss/typography'
import { radius, shadow, spacing, zIndex } from './src/lib/theme/tokens'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: 'var(--bg-primary)',
        secondary: 'var(--bg-secondary)',
        sidebar: 'var(--bg-sidebar)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
        border: 'var(--border-color)',
        accent: 'var(--accent-color)',
        // Semantic status colors — map CSS vars to Tailwind utilities so that
        // `text-error`, `bg-warning-bg`, `border-success-border` etc. work.
        error: 'var(--color-error)',
        'error-bg': 'var(--color-error-bg)',
        'error-border': 'var(--color-error-border)',
        warning: 'var(--color-warning)',
        'warning-bg': 'var(--color-warning-bg)',
        'warning-border': 'var(--color-warning-border)',
        success: 'var(--color-success)',
        'success-bg': 'var(--color-success-bg)',
        'success-border': 'var(--color-success-border)',
        info: 'var(--color-info)',
        'info-bg': 'var(--color-info-bg)',
        'info-border': 'var(--color-info-border)',
      },
      borderRadius: {
        DEFAULT: radius.md,
        sm: radius.sm,
        md: radius.md,
        lg: radius.lg,
        xl: radius.xl,
      },
      boxShadow: {
        sm: shadow.sm,
        DEFAULT: shadow.md,
        md: shadow.md,
        lg: shadow.lg,
        xl: shadow.xl,
      },
      spacing: {
        // Augment (not replace) Tailwind's default spacing scale so existing
        // p-3, m-4 etc. keep working. These aliases let new code say
        // `p-token-3` when it wants to signal "this is a design token choice".
        'token-0': spacing[0],
        'token-1': spacing[1],
        'token-2': spacing[2],
        'token-3': spacing[3],
        'token-4': spacing[4],
        'token-5': spacing[5],
        'token-6': spacing[6],
        'token-8': spacing[8],
      },
      zIndex: {
        sticky: String(zIndex.sticky),
        overlay: String(zIndex.overlay),
        sidebar: String(zIndex.sidebar),
        progress: String(zIndex.progress),
        modal: String(zIndex.modal),
        toast: String(zIndex.toast),
        tooltip: String(zIndex.tooltip),
      },
      transitionDuration: {
        fast: '120ms',
        base: '200ms',
        slow: '320ms',
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [typography],
} satisfies Config
