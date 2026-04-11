import { app } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'

interface Annotation {
  id: string
  filePath: string
  startOffset: number
  endOffset: number
  selectedText: string
  color: string
  note?: string
  createdAt: string
  updatedAt: string
}

function getAnnotationsDir(): string {
  return path.join(app.getPath('userData'), 'annotations')
}

function getAnnotationFile(filePath: string): string {
  const hash = crypto.createHash('sha256').update(filePath).digest('hex').slice(0, 16)
  return path.join(getAnnotationsDir(), `${hash}.json`)
}

export async function loadAnnotations(filePath: string): Promise<Annotation[]> {
  try {
    const annotationFile = getAnnotationFile(filePath)
    const data = await fs.readFile(annotationFile, 'utf-8')
    return JSON.parse(data)
  } catch {
    return []
  }
}

export async function saveAnnotations(filePath: string, annotations: Annotation[]): Promise<void> {
  const dir = getAnnotationsDir()
  await fs.mkdir(dir, { recursive: true })

  const annotationFile = getAnnotationFile(filePath)
  await fs.writeFile(annotationFile, JSON.stringify(annotations, null, 2), 'utf-8')
}
