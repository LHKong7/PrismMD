import type { FileTreeNode } from '../types/electron'

export function flattenFiles(nodes: FileTreeNode[]): string[] {
  const out: string[] = []
  for (const node of nodes) {
    if (node.type === 'file') out.push(node.path)
    else if (node.children) out.push(...flattenFiles(node.children))
  }
  return out
}

export function fileName(path: string): string {
  return path.split(/[/\\]/).pop() ?? path
}

export function fileExt(path: string): string {
  const name = fileName(path)
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
}
