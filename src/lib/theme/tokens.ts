/**
 * Design tokens — the single source of truth for non-color UI primitives.
 *
 * Colors live in `themes.ts` (as CSS variables, because they swap per theme).
 * Everything else — spacing, radius, shadow, z-index, motion — is static and
 * lives here. Tailwind config re-exports these so components can use the
 * utility classes (e.g. `z-modal`, `rounded-md`, `shadow-md`) instead of
 * hand-picking magic numbers.
 */

export const spacing = {
  0: '0',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '24px',
  6: '32px',
  8: '48px',
} as const

export const radius = {
  sm: '4px',
  md: '6px',
  lg: '8px',
  xl: '12px',
  full: '9999px',
} as const

export const shadow = {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
} as const

/**
 * Semantic z-index layers. Values match what is already scattered through the
 * codebase (z-10/20/30/40/50/60) to keep the migration mechanical.
 */
export const zIndex = {
  base: 0,
  sticky: 10,
  overlay: 20,
  sidebar: 30,
  progress: 40,
  modal: 50,
  toast: 60,
  tooltip: 70,
} as const

export const motion = {
  fast: '120ms',
  base: '200ms',
  slow: '320ms',
  easingOut: 'cubic-bezier(0.16, 1, 0.3, 1)',
  easingInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
} as const

/**
 * Data visualization palette — used for graph cluster colors etc., where we
 * deliberately want a stable hue regardless of theme (otherwise the viewer
 * loses track of which color means which cluster). Kept centralized so that
 * if we ever do want per-theme palettes it's a single edit.
 */
export const graphPalette = [
  '#6366f1', // indigo
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#84cc16', // lime
] as const

export type Spacing = keyof typeof spacing
export type Radius = keyof typeof radius
export type Shadow = keyof typeof shadow
export type ZIndex = keyof typeof zIndex
