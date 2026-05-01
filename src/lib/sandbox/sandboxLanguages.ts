const SANDBOXABLE_LANGUAGES = new Set(['html', 'css', 'javascript', 'js'])

export function isSandboxable(language: string): boolean {
  return SANDBOXABLE_LANGUAGES.has(language.toLowerCase())
}
