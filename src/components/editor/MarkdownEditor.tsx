import { markdown } from '@codemirror/lang-markdown'
import { GFM } from '@lezer/markdown'
import { useEditorStore } from '../../store/editorStore'
import { CodeMirrorEditor } from './CodeMirrorEditor'

const mdLang = markdown({ extensions: GFM })

export function MarkdownEditor() {
  const editorContent = useEditorStore((s) => s.editorContent)
  const setEditorContent = useEditorStore((s) => s.setEditorContent)

  return (
    <CodeMirrorEditor
      content={editorContent ?? ''}
      onChange={setEditorContent}
      language={mdLang}
    />
  )
}
