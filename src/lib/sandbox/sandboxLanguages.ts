const SANDBOXABLE_LANGUAGES = new Set(['html', 'css', 'javascript', 'js'])

export function isSandboxable(language: string): boolean {
  return SANDBOXABLE_LANGUAGES.has(language.toLowerCase())
}

/** Check if a language tag has the `:run` suffix (e.g., `python:run`). */
export function isRunnable(language: string): boolean {
  return language.endsWith(':run')
}

/** Strip the `:run` suffix to get the base language (e.g., `python:run` → `python`). */
export function baseLanguage(language: string): string {
  return language.replace(/:run$/, '')
}
