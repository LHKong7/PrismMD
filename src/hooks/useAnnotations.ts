import { useState, useEffect, useCallback } from 'react'
import type { Annotation, AnnotationColor } from '../types/annotation'
import { useFileStore } from '../store/fileStore'

export function useAnnotations() {
  const currentFilePath = useFileStore((s) => s.currentFilePath)
  const [annotations, setAnnotations] = useState<Annotation[]>([])

  // Load annotations when file changes
  useEffect(() => {
    if (!currentFilePath) {
      setAnnotations([])
      return
    }

    window.electronAPI.loadAnnotations(currentFilePath)
      .then(setAnnotations)
      .catch(() => setAnnotations([]))
  }, [currentFilePath])

  // Save annotations whenever they change
  useEffect(() => {
    if (!currentFilePath || annotations.length === 0) return

    const timer = setTimeout(() => {
      window.electronAPI.saveAnnotations(currentFilePath, annotations)
    }, 500)

    return () => clearTimeout(timer)
  }, [currentFilePath, annotations])

  const addAnnotation = useCallback(
    (text: string, color: AnnotationColor, note?: string) => {
      if (!currentFilePath) return

      const now = new Date().toISOString()
      const annotation: Annotation = {
        id: crypto.randomUUID(),
        filePath: currentFilePath,
        startOffset: 0,
        endOffset: text.length,
        selectedText: text,
        color,
        ...(note ? { note } : {}),
        createdAt: now,
        updatedAt: now,
      }

      setAnnotations((prev) => [...prev, annotation])
    },
    [currentFilePath],
  )

  const removeAnnotation = useCallback((id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id))
  }, [])

  return { annotations, addAnnotation, removeAnnotation }
}
