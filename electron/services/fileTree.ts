import fs from 'fs/promises'
import path from 'path'

export interface FileTreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileTreeNode[]
}

const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', '.DS_Store',
  '__pycache__', '.vscode', '.idea', 'dist', 'build',
  'dist-electron', '.next', '.nuxt',
])

// Formats the "Library" can browse + render in the reader. The knowledge-
// graph SDK ingest endpoint accepts this same set. Kept lowercase and
// including the leading dot so `path.extname(…).toLowerCase()` comparisons
// are direct. Mirrored on the renderer in `src/lib/fileFormat.ts` — keep
// the two in sync when adding a format.
const SUPPORTED_EXTENSIONS = new Set([
  '.md', '.markdown', '.mdx',
  '.pdf',
  '.csv',
  '.json',
  '.xlsx', '.xls',
])

/**
 * Build the file tree for a directory.
 *
 * @param dirPath - Root directory to read.
 * @param maxDepth - How many levels deep to recurse. `1` reads only the
 *   immediate children (directories appear as stubs with `children: undefined`
 *   so the renderer knows they can be expanded lazily). `Infinity` reads the
 *   full tree (legacy behavior, used by refresh).
 */
export async function buildFileTree(
  dirPath: string,
  maxDepth: number = 1,
  currentDepth: number = 0,
): Promise<FileTreeNode[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  const nodes: FileTreeNode[] = []

  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.') continue
    if (IGNORED_DIRS.has(entry.name)) continue

    const fullPath = path.join(dirPath, entry.name)

    if (entry.isDirectory()) {
      if (currentDepth + 1 < maxDepth) {
        // Recurse into subdirectory
        const children = await buildFileTree(fullPath, maxDepth, currentDepth + 1)
        nodes.push({
          name: entry.name,
          path: fullPath,
          type: 'directory',
          children,
        })
      } else {
        // Shallow stub — children will be loaded lazily on expand
        nodes.push({
          name: entry.name,
          path: fullPath,
          type: 'directory',
          // children left undefined → renderer knows to lazy-load
        })
      }
    } else if (entry.isFile() && SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      nodes.push({
        name: entry.name,
        path: fullPath,
        type: 'file',
      })
    }
  }

  // Sort: directories first, then files, alphabetically within each group
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return nodes
}
