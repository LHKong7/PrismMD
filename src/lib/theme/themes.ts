export interface ThemeDefinition {
  id: string
  name: string
  isDark: boolean
  colors: Record<string, string>
}

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
      '--highlight-yellow': '#3b3520',
      '--highlight-green': '#1a3a2a',
      '--highlight-blue': '#1a2a3a',
      '--highlight-pink': '#3a1a2a',
      '--highlight-purple': '#2a1a3a',
      '--scrollbar-thumb': '#414868',
      '--progress-bar': '#7aa2f7',
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
