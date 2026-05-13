import { autocompletion, type CompletionContext, type Completion } from '@codemirror/autocomplete'

const SLASH_COMMANDS: Completion[] = [
  {
    label: '/table',
    displayLabel: 'Table',
    detail: 'Insert a table',
    apply: '| Col 1 | Col 2 | Col 3 |\n| ----- | ----- | ----- |\n|       |       |       |',
  },
  {
    label: '/code',
    displayLabel: 'Code Block',
    detail: 'Fenced code block',
    apply: '```\n\n```',
  },
  {
    label: '/h1',
    displayLabel: 'Heading 1',
    detail: 'Large heading',
    apply: '# ',
  },
  {
    label: '/h2',
    displayLabel: 'Heading 2',
    detail: 'Medium heading',
    apply: '## ',
  },
  {
    label: '/h3',
    displayLabel: 'Heading 3',
    detail: 'Small heading',
    apply: '### ',
  },
  {
    label: '/hr',
    displayLabel: 'Divider',
    detail: 'Horizontal rule',
    apply: '---\n',
  },
  {
    label: '/quote',
    displayLabel: 'Blockquote',
    detail: 'Quoted text',
    apply: '> ',
  },
  {
    label: '/ul',
    displayLabel: 'Bullet List',
    detail: 'Unordered list item',
    apply: '- ',
  },
  {
    label: '/ol',
    displayLabel: 'Numbered List',
    detail: 'Ordered list item',
    apply: '1. ',
  },
  {
    label: '/task',
    displayLabel: 'Task List',
    detail: 'Checkbox item',
    apply: '- [ ] ',
  },
  {
    label: '/math',
    displayLabel: 'Math Block',
    detail: 'LaTeX math display',
    apply: '$$\n\n$$',
  },
  {
    label: '/image',
    displayLabel: 'Image',
    detail: 'Embed an image',
    apply: '![alt](url)',
  },
  {
    label: '/link',
    displayLabel: 'Link',
    detail: 'Insert a hyperlink',
    apply: '[text](url)',
  },
]

function slashCompletions(context: CompletionContext) {
  // Match / at start of line or after whitespace
  const match = context.matchBefore(/(?:^|\s)\/[\w]*/)
  if (!match) return null

  // Find the position of the / character
  const slashPos = match.from + match.text.indexOf('/')

  return {
    from: slashPos,
    options: SLASH_COMMANDS,
    filter: true,
  }
}

/**
 * CodeMirror extension that provides a slash-command menu.
 * Type `/` at the start of a line or after whitespace to trigger
 * a popup with markdown snippet options.
 */
export const slashCommandExtension = autocompletion({
  override: [slashCompletions],
  icons: false,
})
