import { useMemo, useRef, useState, useCallback, useEffect, type RefObject } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { FileTreeNode } from '../../types/electron'
import { useFileStore } from '../../store/fileStore'
import { FileTreeNodeItem } from './FileTreeNode'

interface FileTreeProps {
  nodes: FileTreeNode[]
  depth?: number
  /**
   * Optional scroll container for virtualization. When provided and the
   * flattened row count crosses `VIRTUAL_THRESHOLD`, rendering switches
   * to a windowed list so huge folders (10k+ files) don't spawn a DOM
   * node per row. Without a scroll parent we fall back to rendering
   * every row directly (simpler, same behaviour as before but without
   * the deep React component recursion).
   */
  scrollParentRef?: RefObject<HTMLElement>
}

interface FlatRow {
  node: FileTreeNode
  depth: number
  hasChildren: boolean
}

const ROW_HEIGHT = 26 // px — matches the row's py-1 + text-sm line height
const VIRTUAL_THRESHOLD = 200

/**
 * Flatten the expanded portion of the tree into a linear array, then
 * (when a `scrollParentRef` is supplied and the list is large enough)
 * use `@tanstack/react-virtual` so folders with thousands of files
 * don't freeze the UI.
 *
 * Expansion state lives in a `Set<path>` here instead of each row's
 * local `useState` because virtualized rows get unmounted when they
 * scroll out of view — component-local state would reset on every
 * scroll past them.
 */
/**
 * Recursively find a node by path in the tree.
 */
function findNode(nodes: FileTreeNode[], path: string): FileTreeNode | undefined {
  for (const node of nodes) {
    if (node.path === path) return node
    if (node.children && path.startsWith(node.path + '/')) {
      const found = findNode(node.children, path)
      if (found) return found
    }
  }
  return undefined
}

export function FileTree({ nodes, depth = 0, scrollParentRef }: FileTreeProps) {
  const loadChildren = useFileStore((s) => s.loadChildren)
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(depth === 0 ? nodes.filter((n) => n.type === 'directory').map((n) => n.path) : []),
  )
  const [loading, setLoading] = useState<Set<string>>(() => new Set())

  const toggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
        // Lazy-load children if this directory hasn't been loaded yet
        const node = findNode(nodes, path)
        if (node && node.type === 'directory' && node.children === undefined) {
          setLoading((prev) => { const s = new Set(prev); s.add(path); return s })
          void loadChildren(path).finally(() => {
            setLoading((prev) => { const s = new Set(prev); s.delete(path); return s })
          })
        }
      }
      return next
    })
  }, [nodes, loadChildren])

  // Auto-expand a newly created folder so it's visible and ready for rename.
  const autoExpandPath = useFileStore((s) => s.autoExpandPath)
  const setAutoExpandPath = useFileStore((s) => s.setAutoExpandPath)
  useEffect(() => {
    if (autoExpandPath) {
      setExpanded((prev) => {
        if (prev.has(autoExpandPath)) return prev
        const next = new Set(prev)
        next.add(autoExpandPath)
        return next
      })
      setAutoExpandPath(null)
    }
  }, [autoExpandPath, setAutoExpandPath])

  // When top-level directories are auto-expanded but their children haven't
  // been loaded yet (lazy stubs), kick off the load so the tree populates.
  useEffect(() => {
    for (const node of nodes) {
      if (
        node.type === 'directory' &&
        expanded.has(node.path) &&
        node.children === undefined &&
        !loading.has(node.path)
      ) {
        setLoading((prev) => { const s = new Set(prev); s.add(node.path); return s })
        void loadChildren(node.path).finally(() => {
          setLoading((prev) => { const s = new Set(prev); s.delete(node.path); return s })
        })
      }
    }
  }, [nodes, expanded, loading, loadChildren])

  const rows = useMemo<FlatRow[]>(() => {
    const out: FlatRow[] = []
    const walk = (items: FileTreeNode[], d: number) => {
      for (const node of items) {
        // A directory is expandable if it has children loaded OR if children
        // are undefined (lazy stub — not yet loaded).
        const hasChildren = node.type === 'directory' &&
          (node.children === undefined || node.children.length > 0)
        out.push({ node, depth: d, hasChildren })
        if (node.type === 'directory' && expanded.has(node.path) && node.children) {
          walk(node.children, d + 1)
        }
      }
    }
    walk(nodes, depth)
    return out
  }, [nodes, expanded, depth])

  const shouldVirtualize = !!scrollParentRef && rows.length >= VIRTUAL_THRESHOLD

  if (!shouldVirtualize) {
    return (
      <div>
        {rows.map(({ node, depth: d, hasChildren }) => (
          <FileTreeNodeItem
            key={node.path}
            node={node}
            depth={d}
            hasChildren={hasChildren}
            expanded={expanded.has(node.path)}
            onToggle={toggle}
          />
        ))}
      </div>
    )
  }

  return (
    <VirtualList
      rows={rows}
      expanded={expanded}
      toggle={toggle}
      scrollParentRef={scrollParentRef!}
    />
  )
}

function VirtualList({
  rows,
  expanded,
  toggle,
  scrollParentRef,
}: {
  rows: FlatRow[]
  expanded: Set<string>
  toggle: (path: string) => void
  scrollParentRef: RefObject<HTMLElement>
}) {
  const listRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  })

  // Force a re-measure on parent scroll — the parent scroll element is
  // shared with siblings (other folder sections), so we want to be
  // conservative and re-measure when our own visible window changes.
  useEffect(() => {
    const el = scrollParentRef.current
    if (!el) return
    const handler = () => virtualizer.measure()
    // Passive listener so we don't block the scroll frame.
    el.addEventListener('scroll', handler, { passive: true })
    return () => el.removeEventListener('scroll', handler)
  }, [scrollParentRef, virtualizer])

  return (
    <div
      ref={listRef}
      style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
    >
      {virtualizer.getVirtualItems().map((vi) => {
        const { node, depth: d, hasChildren } = rows[vi.index]
        return (
          <div
            key={node.path}
            data-index={vi.index}
            ref={virtualizer.measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              transform: `translateY(${vi.start}px)`,
              height: ROW_HEIGHT,
            }}
          >
            <FileTreeNodeItem
              node={node}
              depth={d}
              hasChildren={hasChildren}
              expanded={expanded.has(node.path)}
              onToggle={toggle}
            />
          </div>
        )
      })}
    </div>
  )
}
