/**
 * FrontStageView — 烛笺阁 / Inkwell Keep front stage.
 *
 * Mounts the Pixi-rendered world (room + scribes + player) into a canvas and
 * layers React chrome on top: the HUD and the three overlays (Stacks / Desk /
 * NPC dialog). The Pixi world owns movement + the per-frame loop; React only
 * reacts to hotspot activation and freezes the world while an overlay is open.
 *
 * Mounted as a z-50 overlay over the still-live backstage UI, so entering a
 * book or the desk just lowers this view onto the already-opened document.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DoorOpen } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { useWorkspaceStore } from '../../store/workspaceStore'
import type { Hotspot } from './sceneConfig'
import { PixiWorld } from './pixi/PixiWorld'
import type { ShelfBook } from './pixi/shelfBooks'
import type { PageTreeNode } from '../../types/electron'
import { StacksOverlay } from './overlays/StacksOverlay'
import { DeskMenu } from './overlays/DeskMenu'
import { NpcDialog } from './overlays/NpcDialog'
import { RoundTableOverlay } from './overlays/RoundTableOverlay'
import { ArchiveOverlay } from './overlays/ArchiveOverlay'
import { MuseWallOverlay } from './overlays/MuseWallOverlay'
import '../../styles/frontstage.css'

type Overlay =
  | { type: 'stacks'; pageId?: string }
  | { type: 'desk' }
  | { type: 'npc'; npcId: string }
  | { type: 'roundtable' }
  | { type: 'archive' }
  | { type: 'muse' }
  | null

export function FrontStageView() {
  const { t } = useTranslation()
  const setFrontStageActive = useUIStore((s) => s.setFrontStageActive)

  const [overlay, setOverlay] = useState<Overlay>(null)
  const canvasHostRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<PixiWorld | null>(null)

  // ── Data-driven shelf ──
  const pageTree = useWorkspaceStore((s) => s.pageTree)
  const [metaMap, setMetaMap] = useState<Record<string, { status: string | null; genre: string | null; quality: number | null; length: number }>>({})

  const refreshMeta = useCallback(async () => {
    try {
      const list = await window.electronAPI.pageMetaList()
      const m: Record<string, { status: string | null; genre: string | null; quality: number | null; length: number }> = {}
      for (const x of list) m[x.pageId] = { status: x.status, genre: x.genre, quality: x.quality, length: x.length }
      setMetaMap(m)
    } catch {
      /* ignore */
    }
  }, [])

  const books = useMemo<ShelfBook[]>(() => {
    const out: ShelfBook[] = []
    const walk = (nodes: PageTreeNode[]) => {
      for (const n of nodes) {
        if (!n.isFolder) {
          const m = metaMap[n.id]
          out.push({ pageId: n.id, title: n.title, status: m?.status ?? null, genre: m?.genre ?? null, quality: m?.quality ?? null, length: m?.length ?? 0 })
        }
        if (n.children?.length) walk(n.children)
      }
    }
    walk(pageTree)
    return out
  }, [pageTree, metaMap])

  const booksRef = useRef(books)
  booksRef.current = books

  const onBookClick = useCallback((pageId: string) => setOverlay({ type: 'stacks', pageId }), [])
  const onBookClickRef = useRef(onBookClick)
  onBookClickRef.current = onBookClick

  const activate = useCallback((h: Hotspot) => {
    switch (h.kind) {
      case 'door':
        setFrontStageActive(false)
        break
      case 'stacks':
        setOverlay({ type: 'stacks' })
        break
      case 'desk':
        setOverlay({ type: 'desk' })
        break
      case 'npc':
        if (h.npcId) setOverlay({ type: 'npc', npcId: h.npcId })
        break
      case 'roundtable':
        setOverlay({ type: 'roundtable' })
        break
      case 'archive':
        setOverlay({ type: 'archive' })
        break
      case 'muse':
        setOverlay({ type: 'muse' })
        break
    }
  }, [setFrontStageActive])

  // Keep latest callbacks reachable from the world (created once).
  const activateRef = useRef(activate)
  activateRef.current = activate
  const labelRef = useRef<(h: Hotspot) => string>((h) => h.labelZh)
  labelRef.current = (h) => t(h.labelKey, h.labelZh)

  // Mount the Pixi world once.
  useEffect(() => {
    const host = canvasHostRef.current
    if (!host) return
    const world = new PixiWorld(host, {
      onActivate: (h) => activateRef.current(h),
      label: (h) => labelRef.current(h),
      onBookClick: (id) => onBookClickRef.current(id),
    })
    worldRef.current = world
    const ready = world.init()
    void ready.then(() => {
      if (worldRef.current === world) world.setBooks(booksRef.current)
    })
    return () => {
      worldRef.current = null
      void ready.then(() => world.destroy())
    }
  }, [])

  // Push book data into the world whenever it changes.
  useEffect(() => {
    worldRef.current?.setBooks(books)
  }, [books])

  // Refresh book-skin metadata on mount and whenever an overlay closes
  // (tagging / round-table / a new page may have changed it).
  useEffect(() => {
    if (overlay === null) void refreshMeta()
  }, [overlay, refreshMeta])

  // Freeze world input while an overlay is open.
  useEffect(() => {
    worldRef.current?.setEnabled(overlay === null)
  }, [overlay])

  // Esc closes an open overlay (the world owns E + movement keys).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && overlay) {
        e.preventDefault()
        setOverlay(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [overlay])

  const closeOverlay = () => setOverlay(null)

  return (
    <div className="fs-root">
      <div className="fs-hud fs-hud-top">
        <div className="fs-hud-brand">
          <span className="fs-hud-title">烛笺阁</span>
          <span className="fs-hud-sub">Inkwell Keep</span>
        </div>
        <button className="fs-backstage-btn" onClick={() => setFrontStageActive(false)}>
          <DoorOpen size={14} /> {t('frontStage.backstage', '进入工作台')}
        </button>
      </div>

      <div className="fs-stage-wrap">
        <div ref={canvasHostRef} className="fs-canvas-host" />
      </div>

      <div className="fs-hud fs-hud-bottom">
        <span className="fs-hint">
          <b>WASD</b> / <b>方向键</b> {t('frontStage.hint.move', '移动')} · {t('frontStage.hint.click', '点击地面行走')} · <span className="fs-key fs-key-sm">E</span> {t('frontStage.hint.interact', '交互')}
        </span>
      </div>

      {overlay && (
        <div className="fs-overlay-scrim" onClick={closeOverlay}>
          <div onClick={(e) => e.stopPropagation()}>
            {overlay.type === 'stacks' && <StacksOverlay onClose={closeOverlay} initialSelected={overlay.pageId} />}
            {overlay.type === 'desk' && <DeskMenu onClose={closeOverlay} />}
            {overlay.type === 'npc' && <NpcDialog npcId={overlay.npcId} onClose={closeOverlay} />}
            {overlay.type === 'roundtable' && (
              <RoundTableOverlay onClose={closeOverlay} onGoStacks={() => setOverlay({ type: 'stacks' })} />
            )}
            {overlay.type === 'archive' && <ArchiveOverlay onClose={closeOverlay} />}
            {overlay.type === 'muse' && <MuseWallOverlay onClose={closeOverlay} />}
          </div>
        </div>
      )}
    </div>
  )
}
