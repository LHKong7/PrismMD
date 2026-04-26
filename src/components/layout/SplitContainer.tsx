import { useCallback } from 'react'
import { useUIStore } from '../../store/uiStore'
import { PaneView } from './PaneView'
import { SplitDivider } from './SplitDivider'

/**
 * Manages the split-pane layout in the main content area. Renders one
 * or two PaneView instances with an optional draggable divider.
 *
 * In single-pane mode this is a transparent wrapper that renders
 * PaneView directly (zero visual or behavioral difference from before
 * the split feature was added).
 */
export function SplitContainer() {
  const splitLayout = useUIStore((s) => s.splitLayout)
  const setSplitRatio = useUIStore((s) => s.setSplitRatio)
  const saveLayout = useUIStore((s) => s.saveLayout)

  const handleRatioChangeEnd = useCallback(() => {
    void saveLayout()
  }, [saveLayout])

  if (!splitLayout.split) {
    return <div className="h-full"><PaneView paneId="pane-1" /></div>
  }

  const isHorizontal = splitLayout.direction === 'horizontal'
  const ratioPercent = `${splitLayout.splitRatio * 100}%`

  return (
    <div
      className={isHorizontal ? 'flex h-full' : 'flex flex-col h-full'}
    >
      <div
        className="overflow-hidden"
        style={isHorizontal
          ? { width: ratioPercent, minWidth: 0 }
          : { height: ratioPercent, minHeight: 0 }
        }
      >
        <PaneView paneId="pane-1" />
      </div>

      <SplitDivider
        direction={splitLayout.direction}
        onRatioChange={setSplitRatio}
        onRatioChangeEnd={handleRatioChangeEnd}
      />

      <div
        className="overflow-hidden"
        style={{ flex: 1, minWidth: 0, minHeight: 0 }}
      >
        <PaneView paneId="pane-2" />
      </div>
    </div>
  )
}
