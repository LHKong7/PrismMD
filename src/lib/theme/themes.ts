export interface ThemeDefinition {
  id: string
  name: string
  isDark: boolean
  colors: Record<string, string>
}

/**
 * Each theme defines both the structural palette (--bg-*, --text-*, --accent-*)
 * and a set of semantic colors (--color-error/warning/success/info and their
 * -bg/-border variants). Components must NEVER hardcode hex colors for status
 * — they should reference these tokens so every preset keeps a consistent feel.
 *
 * Semantic colors are chosen per-theme with two constraints:
 *   - foreground (--color-*) has ≥ 4.5:1 contrast against --bg-primary (WCAG AA)
 *   - `-bg` is a low-alpha tint so banners read as subdued status, not shouting
 *   - `-border` sits between the two so outlined callouts still register
 *
 * --color-search-highlight is tuned separately because it sits behind text, so
 * we care about contrast of --text-primary ON TOP of the highlight, not the
 * highlight vs background.
 */
export const themes: ThemeDefinition[] = [
  {
    id: 'light',
    name: 'Light',
    isDark: false,
    colors: {
      '--bg-primary': '#ffffff',
      '--bg-secondary': '#f8f9fa',
      '--bg-sidebar': '#f1f3f5',
      '--text-primary': '#1a1a2e',
      '--text-secondary': '#495057',
      '--text-muted': '#868e96',
      '--border-color': '#e9ecef',
      '--accent-color': '#228be6',
      '--accent-hover': '#1c7ed6',
      '--code-bg': '#f4f4f5',
      '--highlight-yellow': '#fef3c7',
      '--highlight-green': '#d1fae5',
      '--highlight-blue': '#dbeafe',
      '--highlight-pink': '#fce7f3',
      '--highlight-purple': '#ede9fe',
      '--scrollbar-thumb': '#c1c1c1',
      '--progress-bar': '#228be6',
      // Semantic colors
      '--color-error': '#dc2626',
      '--color-error-bg': 'rgba(220, 38, 38, 0.08)',
      '--color-error-border': 'rgba(220, 38, 38, 0.4)',
      '--color-warning': '#d97706',
      '--color-warning-bg': 'rgba(217, 119, 6, 0.1)',
      '--color-warning-border': 'rgba(217, 119, 6, 0.4)',
      '--color-success': '#16a34a',
      '--color-success-bg': 'rgba(22, 163, 74, 0.1)',
      '--color-success-border': 'rgba(22, 163, 74, 0.4)',
      '--color-info': '#2563eb',
      '--color-info-bg': 'rgba(37, 99, 235, 0.08)',
      '--color-info-border': 'rgba(37, 99, 235, 0.4)',
      // Search highlight — WCAG AA against --text-primary (#1a1a2e → ~8:1 on #fde68a)
      '--color-search-highlight': '#fde68a',
      '--color-search-highlight-active': '#fbbf24',
    },
  },
  {
    id: 'dark',
    name: 'Dark',
    isDark: true,
    colors: {
      '--bg-primary': '#1a1b26',
      '--bg-secondary': '#1f2133',
      '--bg-sidebar': '#16161e',
      '--text-primary': '#c0caf5',
      '--text-secondary': '#9aa5ce',
      '--text-muted': '#565f89',
      '--border-color': '#292e42',
      '--accent-color': '#7aa2f7',
      '--accent-hover': '#89b4fa',
      '--code-bg': '#24283b',
      '--highlight-yellow': '#5a4818',
      '--highlight-green': '#14512f',
      '--highlight-blue': '#1d3f6b',
      '--highlight-pink': '#6b1d44',
      '--highlight-purple': '#4a2670',
      '--scrollbar-thumb': '#414868',
      '--progress-bar': '#7aa2f7',
      '--color-error': '#f87171',
      '--color-error-bg': 'rgba(248, 113, 113, 0.12)',
      '--color-error-border': 'rgba(248, 113, 113, 0.45)',
      '--color-warning': '#fbbf24',
      '--color-warning-bg': 'rgba(251, 191, 36, 0.12)',
      '--color-warning-border': 'rgba(251, 191, 36, 0.45)',
      '--color-success': '#4ade80',
      '--color-success-bg': 'rgba(74, 222, 128, 0.12)',
      '--color-success-border': 'rgba(74, 222, 128, 0.4)',
      '--color-info': '#60a5fa',
      '--color-info-bg': 'rgba(96, 165, 250, 0.12)',
      '--color-info-border': 'rgba(96, 165, 250, 0.4)',
      '--color-search-highlight': '#854d0e',
      '--color-search-highlight-active': '#a16207',
    },
  },
  {
    id: 'nord',
    name: 'Nord',
    isDark: true,
    colors: {
      '--bg-primary': '#2e3440',
      '--bg-secondary': '#3b4252',
      '--bg-sidebar': '#272c36',
      '--text-primary': '#eceff4',
      '--text-secondary': '#d8dee9',
      '--text-muted': '#7b88a1',
      '--border-color': '#434c5e',
      '--accent-color': '#88c0d0',
      '--accent-hover': '#8fbcbb',
      '--code-bg': '#3b4252',
      '--highlight-yellow': '#3d3828',
      '--highlight-green': '#2b3d2f',
      '--highlight-blue': '#2b3540',
      '--highlight-pink': '#3d2b35',
      '--highlight-purple': '#352b3d',
      '--scrollbar-thumb': '#4c566a',
      '--progress-bar': '#88c0d0',
      // Nord palette: bf616a (red), d08770 (orange), ebcb8b (yellow), a3be8c (green), 81a1c1 (blue)
      '--color-error': '#bf616a',
      '--color-error-bg': 'rgba(191, 97, 106, 0.15)',
      '--color-error-border': 'rgba(191, 97, 106, 0.45)',
      '--color-warning': '#ebcb8b',
      '--color-warning-bg': 'rgba(235, 203, 139, 0.12)',
      '--color-warning-border': 'rgba(235, 203, 139, 0.45)',
      '--color-success': '#a3be8c',
      '--color-success-bg': 'rgba(163, 190, 140, 0.12)',
      '--color-success-border': 'rgba(163, 190, 140, 0.45)',
      '--color-info': '#81a1c1',
      '--color-info-bg': 'rgba(129, 161, 193, 0.12)',
      '--color-info-border': 'rgba(129, 161, 193, 0.45)',
      '--color-search-highlight': '#4d4228',
      '--color-search-highlight-active': '#6b5a3a',
    },
  },
  {
    id: 'solarized-light',
    name: 'Solarized Light',
    isDark: false,
    colors: {
      '--bg-primary': '#fdf6e3',
      '--bg-secondary': '#eee8d5',
      '--bg-sidebar': '#f5efdc',
      '--text-primary': '#586e75',
      '--text-secondary': '#657b83',
      '--text-muted': '#93a1a1',
      '--border-color': '#eee8d5',
      '--accent-color': '#268bd2',
      '--accent-hover': '#2176b8',
      '--code-bg': '#eee8d5',
      '--highlight-yellow': '#f5e6b8',
      '--highlight-green': '#d5e8d0',
      '--highlight-blue': '#d0e0f0',
      '--highlight-pink': '#f0d0e0',
      '--highlight-purple': '#e0d0f0',
      '--scrollbar-thumb': '#c0b8a0',
      '--progress-bar': '#268bd2',
      // Solarized palette: dc322f (red), cb4b16 (orange), b58900 (yellow), 859900 (green), 268bd2 (blue)
      '--color-error': '#dc322f',
      '--color-error-bg': 'rgba(220, 50, 47, 0.1)',
      '--color-error-border': 'rgba(220, 50, 47, 0.4)',
      '--color-warning': '#b58900',
      '--color-warning-bg': 'rgba(181, 137, 0, 0.12)',
      '--color-warning-border': 'rgba(181, 137, 0, 0.4)',
      '--color-success': '#859900',
      '--color-success-bg': 'rgba(133, 153, 0, 0.12)',
      '--color-success-border': 'rgba(133, 153, 0, 0.4)',
      '--color-info': '#268bd2',
      '--color-info-bg': 'rgba(38, 139, 210, 0.1)',
      '--color-info-border': 'rgba(38, 139, 210, 0.4)',
      '--color-search-highlight': '#f5e6b8',
      '--color-search-highlight-active': '#ecd97a',
    },
  },
  {
    id: 'solarized-dark',
    name: 'Solarized Dark',
    isDark: true,
    colors: {
      '--bg-primary': '#002b36',
      '--bg-secondary': '#073642',
      '--bg-sidebar': '#001f28',
      '--text-primary': '#839496',
      '--text-secondary': '#93a1a1',
      '--text-muted': '#586e75',
      '--border-color': '#073642',
      '--accent-color': '#268bd2',
      '--accent-hover': '#2aa198',
      '--code-bg': '#073642',
      '--highlight-yellow': '#1a2a20',
      '--highlight-green': '#0a2a1a',
      '--highlight-blue': '#0a2030',
      '--highlight-pink': '#200a1a',
      '--highlight-purple': '#1a0a2a',
      '--scrollbar-thumb': '#586e75',
      '--progress-bar': '#268bd2',
      '--color-error': '#dc322f',
      '--color-error-bg': 'rgba(220, 50, 47, 0.15)',
      '--color-error-border': 'rgba(220, 50, 47, 0.45)',
      '--color-warning': '#b58900',
      '--color-warning-bg': 'rgba(181, 137, 0, 0.18)',
      '--color-warning-border': 'rgba(181, 137, 0, 0.5)',
      '--color-success': '#859900',
      '--color-success-bg': 'rgba(133, 153, 0, 0.18)',
      '--color-success-border': 'rgba(133, 153, 0, 0.5)',
      '--color-info': '#268bd2',
      '--color-info-bg': 'rgba(38, 139, 210, 0.15)',
      '--color-info-border': 'rgba(38, 139, 210, 0.45)',
      '--color-search-highlight': '#3d3d1e',
      '--color-search-highlight-active': '#5c5b2a',
    },
  },
  {
    id: 'dracula',
    name: 'Dracula',
    isDark: true,
    colors: {
      '--bg-primary': '#282a36',
      '--bg-secondary': '#343746',
      '--bg-sidebar': '#21222c',
      '--text-primary': '#f8f8f2',
      '--text-secondary': '#cccce0',
      '--text-muted': '#6272a4',
      '--border-color': '#44475a',
      '--accent-color': '#bd93f9',
      '--accent-hover': '#ff79c6',
      '--code-bg': '#343746',
      '--highlight-yellow': '#3d3520',
      '--highlight-green': '#1a3d2a',
      '--highlight-blue': '#1a2a3d',
      '--highlight-pink': '#3d1a2a',
      '--highlight-purple': '#2a1a3d',
      '--scrollbar-thumb': '#6272a4',
      '--progress-bar': '#bd93f9',
      // Dracula palette: ff5555 (red), ffb86c (orange), f1fa8c (yellow), 50fa7b (green), 8be9fd (cyan)
      '--color-error': '#ff5555',
      '--color-error-bg': 'rgba(255, 85, 85, 0.12)',
      '--color-error-border': 'rgba(255, 85, 85, 0.45)',
      '--color-warning': '#ffb86c',
      '--color-warning-bg': 'rgba(255, 184, 108, 0.12)',
      '--color-warning-border': 'rgba(255, 184, 108, 0.45)',
      '--color-success': '#50fa7b',
      '--color-success-bg': 'rgba(80, 250, 123, 0.12)',
      '--color-success-border': 'rgba(80, 250, 123, 0.4)',
      '--color-info': '#8be9fd',
      '--color-info-bg': 'rgba(139, 233, 253, 0.12)',
      '--color-info-border': 'rgba(139, 233, 253, 0.4)',
      '--color-search-highlight': '#57502a',
      '--color-search-highlight-active': '#7a6d35',
    },
  },
]

export function getThemeById(id: string): ThemeDefinition | undefined {
  return themes.find((t) => t.id === id)
}

export function applyTheme(theme: ThemeDefinition) {
  const root = document.documentElement

  // Apply CSS variables
  for (const [key, value] of Object.entries(theme.colors)) {
    root.style.setProperty(key, value)
  }

  // Toggle dark class
  if (theme.isDark) {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}
