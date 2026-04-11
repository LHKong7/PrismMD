import { useState, useEffect, useCallback } from 'react'
import type { AnnotationColor } from '../../types/annotation'

const COLORS: { name: AnnotationColor; bg: string }[] = [
  { name: 'yellow', bg: 'var(--highlight-yellow)' },
  { name: 'green', bg: 'var(--highlight-green)' },
  { name: 'blue', bg: 'var(--highlight-blue)' },
  { name: 'pink', bg: 'var(--highlight-pink)' },
  { name: 'purple', bg: 'var(--highlight-purple)' },
]

interface HighlightPopoverProps {
  onHighlight: (text: string, color: AnnotationColor) => void
}

export function HighlightPopover({ onHighlight }: HighlightPopoverProps) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const [selectedText, setSelectedText] = useState('')

  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      setPosition(null)
      return
    }

    const text = selection.toString()
    const range = selection.getRangeAt(0)
    const rect = range.getBoundingClientRect()

    setSelectedText(text)
    setPosition({
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
    })
  }, [])

  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp)
    return () => document.removeEventListener('mouseup', handleMouseUp)
  }, [handleMouseUp])

  if (!position) return null

  return (
    <div
      className="fixed z-50 flex items-center gap-1 p-1.5 rounded-lg shadow-lg border"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, -100%)',
        backgroundColor: 'var(--bg-primary)',
        borderColor: 'var(--border-color)',
      }}
    >
      {COLORS.map(({ name, bg }) => (
        <button
          key={name}
          onClick={() => {
            onHighlight(selectedText, name)
            setPosition(null)
            window.getSelection()?.removeAllRanges()
          }}
          className="w-5 h-5 rounded-full border transition-transform hover:scale-125"
          style={{
            backgroundColor: bg,
            borderColor: 'var(--border-color)',
          }}
          title={`Highlight ${name}`}
        />
      ))}
    </div>
  )
}
