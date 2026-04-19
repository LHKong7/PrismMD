import { markdown } from '@codemirror/lang-markdown'
import { useEditorStore } from '../../store/editorStore'
import { CodeMirrorEditor } from './CodeMirrorEditor'

const mdLang = markdown()

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
