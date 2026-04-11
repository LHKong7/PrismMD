import type { FileTreeNode } from '../../types/electron'
import { FileTreeNodeItem } from './FileTreeNode'

interface FileTreeProps {
  nodes: FileTreeNode[]
  depth?: number
}

export function FileTree({ nodes, depth = 0 }: FileTreeProps) {
  return (
    <div>
      {nodes.map((node) => (
        <FileTreeNodeItem key={node.path} node={node} depth={depth} />
      ))}
    </div>
  )
}
