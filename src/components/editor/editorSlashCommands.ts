import { autocompletion, type CompletionContext, type Completion } from '@codemirror/autocomplete'
import { wikiLinkCompletions } from './editorWikiLinkComplete'

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
  {
    label: '/link-note',
    displayLabel: 'Link to a note',
    detail: 'Wiki link — pick a note, or name one you have not written yet',
    apply: '[[]]',
  },
  {
    label: '/template',
    displayLabel: 'Template',
    detail: 'Insert a template (manage in Settings → Templates)',
    apply: '<!-- Use Cmd+P to search and insert a template -->',
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
 * CodeMirror extension providing the editor's two completion menus: `/` for
 * markdown snippets and `[[` for links to other notes.
 */
export const slashCommandExtension = autocompletion({
  // Both sources go through one `autocompletion()` instance: two of them in
  // the same editor fight over the popup, and whichever was registered last
  // wins silently.
  override: [slashCompletions, wikiLinkCompletions],
  icons: false,
})
