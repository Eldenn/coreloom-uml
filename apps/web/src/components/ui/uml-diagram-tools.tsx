'use client'

// Coreloom UI — UmlDiagram tools. What sits on the canvas around the drawing: the zoom, fit,
// select-an-area and arrange buttons; the bar that aligns and spaces the selected boxes; and the
// field that renames an element in place (F2 or a double click); and full screen. UmlDiagram
// places them.
import { Panel, useReactFlow } from '@xyflow/react'
import {
  AlignCenterHorizontalIcon,
  AlignCenterVerticalIcon,
  AlignEndHorizontalIcon,
  AlignEndVerticalIcon,
  AlignHorizontalDistributeCenterIcon,
  AlignStartHorizontalIcon,
  AlignStartVerticalIcon,
  AlignVerticalDistributeCenterIcon,
  ExpandIcon,
  LayoutGridIcon,
  type LucideIcon,
  MaximizeIcon,
  ShrinkIcon,
  SquareDashedMousePointerIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Toolbar, ToolbarButton } from '@/components/ui/toolbar'
import { useCoreloomI18n } from '@/lib/i18n'
import type { UmlPoint, UmlSpec } from '@/lib/uml'
import { ALIGNMENTS, canAlign, type UmlAlignment } from '@/lib/uml-arrange'
import { UML_DRAG_TYPE } from '@/lib/uml-edit'
import type { DiagramGraph } from '@/lib/uml-graph'
import { cn } from '@/lib/utils'

/** Whether the browser lets a page show an element full screen (false on the server). */
function canFullscreen(): boolean {
  return typeof document !== 'undefined' && document.fullscreenEnabled
}

function subscribeNothing() {
  return () => undefined
}

interface Fullscreen {
  /** The browser allows it; the button stays hidden otherwise. */
  supported: boolean
  /** The diagram fills the screen now. */
  active: boolean
  toggle: () => void
}

/**
 * Full screen for `target` through the Fullscreen API. Escape leaves it (the browser handles the
 * key); focus then goes back to the button.
 */
function useFullscreen(target: React.RefObject<HTMLElement | null>): Fullscreen {
  const supported = React.useSyncExternalStore(subscribeNothing, canFullscreen, () => false)
  const [active, setActive] = React.useState(false)
  React.useEffect(() => {
    let was = false
    const onChange = () => {
      const el = target.current
      const now = el !== null && document.fullscreenElement === el
      // Leaving (the button, or Escape): focus goes back to the button, not to the page.
      if (was && !now) el?.querySelector<HTMLElement>('[data-uml-fullscreen]')?.focus()
      was = now
      setActive(now)
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
    }
  }, [target])
  const toggle = () => {
    if (active) void document.exitFullscreen()
    else void target.current?.requestFullscreen()
  }
  return { supported, active, toggle }
}

/** Enters or leaves full screen; nothing when the browser doesn't allow it. */
function FullscreenButton({
  fullscreen,
  className,
}: {
  fullscreen: Fullscreen
  className?: string
}) {
  const t = useCoreloomI18n().messages.diagram
  if (!fullscreen.supported) return null
  const label = fullscreen.active ? t.exitFullscreen : t.fullscreen
  const Icon = fullscreen.active ? ShrinkIcon : ExpandIcon
  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      aria-label={label}
      aria-pressed={fullscreen.active}
      title={label}
      data-uml-fullscreen=""
      data-uml-export-skip=""
      onClick={fullscreen.toggle}
      className={cn('bg-background', className)}
    >
      <Icon aria-hidden />
    </Button>
  )
}

function CanvasControls({
  editable,
  selecting,
  onSelecting,
  onArrange,
  fullscreen,
}: {
  editable: boolean
  /** Dragging on the canvas draws a selection box instead of moving the view. */
  selecting: boolean
  onSelecting: (on: boolean) => void
  onArrange: () => void
  fullscreen: Fullscreen | null
}) {
  const t = useCoreloomI18n().messages.diagram
  const flow = useReactFlow()
  const buttons = [
    { label: t.zoomIn, icon: ZoomInIcon, run: () => void flow.zoomIn() },
    { label: t.zoomOut, icon: ZoomOutIcon, run: () => void flow.zoomOut() },
    {
      label: t.fit,
      icon: MaximizeIcon,
      run: () => void flow.fitView({ padding: 0.15, maxZoom: 1 }),
    },
    ...(editable ? [{ label: t.arrange, icon: LayoutGridIcon, run: onArrange }] : []),
  ]
  return (
    <Panel position="top-right" className="!m-2 flex gap-1">
      {editable && (
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={t.selectArea}
          aria-pressed={selecting}
          title={t.selectArea}
          onClick={() => {
            onSelecting(!selecting)
          }}
          className={cn('bg-background', selecting && 'border-primary bg-primary-subtle')}
        >
          <SquareDashedMousePointerIcon aria-hidden />
        </Button>
      )}
      {buttons.map(({ label, icon: Icon, run }) => (
        <Button
          key={label}
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={label}
          title={label}
          onClick={run}
          className="bg-background"
        >
          <Icon aria-hidden />
        </Button>
      ))}
      {fullscreen && <FullscreenButton fullscreen={fullscreen} />}
    </Panel>
  )
}

const ALIGN_ICONS: Record<UmlAlignment, LucideIcon> = {
  left: AlignStartVerticalIcon,
  center: AlignCenterVerticalIcon,
  right: AlignEndVerticalIcon,
  top: AlignStartHorizontalIcon,
  middle: AlignCenterHorizontalIcon,
  bottom: AlignEndHorizontalIcon,
  distributeHorizontally: AlignHorizontalDistributeCenterIcon,
  distributeVertically: AlignVerticalDistributeCenterIcon,
}

/** Shown while two boxes or more are selected: line them up, or space them evenly. */
function AlignBar({ count, onAlign }: { count: number; onAlign: (how: UmlAlignment) => void }) {
  const t = useCoreloomI18n().messages.diagram.align
  return (
    <Panel position="bottom-center" className="!mb-3">
      <Toolbar aria-label={t.label} className="bg-background shadow-sm">
        {ALIGNMENTS.map((how) => {
          const Icon = ALIGN_ICONS[how]
          return (
            <ToolbarButton
              key={how}
              aria-label={t[how]}
              tooltip={t[how]}
              disabled={!canAlign(how, count)}
              onClick={() => {
                onAlign(how)
              }}
            >
              <Icon aria-hidden />
            </ToolbarButton>
          )
        })}
      </Toolbar>
    </Panel>
  )
}

interface RenameTarget {
  id: string
  value: string
  /** Where the box's top edge is, in the canvas's own pixels. */
  left: number
  top: number
  width: number
}

/** A name field over an element's title. Enter or leaving applies; Escape puts the name back. */
function RenameField({
  target,
  label,
  onDone,
}: {
  target: RenameTarget
  label: string
  /** The new name, or null when it was cancelled. */
  onDone: (value: string | null) => void
}) {
  const [value, setValue] = React.useState(target.value)
  const input = React.useRef<HTMLInputElement>(null)
  const done = React.useRef(false)
  React.useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [])
  const finish = (next: string | null) => {
    if (done.current) return
    done.current = true
    onDone(next)
  }
  return (
    <Input
      ref={input}
      aria-label={label}
      value={value}
      data-uml-export-skip=""
      className="absolute z-10 h-8 bg-background text-[13px] shadow-md"
      style={{ left: target.left, top: target.top + 4, width: target.width }}
      onChange={(e) => {
        setValue(e.target.value)
      }}
      onBlur={() => {
        finish(value)
      }}
      onKeyDown={(e) => {
        // The canvas mustn't read these keys as its own (Delete, arrows, F2).
        e.stopPropagation()
        if (e.key === 'Enter') finish(value)
        if (e.key === 'Escape') finish(null)
      }}
    />
  )
}

function dropHandlers(
  onDrop: ((type: string, position: UmlPoint) => void) | undefined,
  toFlow: (p: UmlPoint) => UmlPoint,
) {
  if (!onDrop) return {}
  return {
    onDragOver: (event: React.DragEvent) => {
      if (!event.dataTransfer.types.includes(UML_DRAG_TYPE)) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
    },
    onDrop: (event: React.DragEvent) => {
      const type = event.dataTransfer.getData(UML_DRAG_TYPE)
      if (!type) return
      event.preventDefault()
      const p = toFlow({ x: event.clientX, y: event.clientY })
      onDrop(type, { x: Math.round(p.x), y: Math.round(p.y) })
    },
  }
}

/** Renaming in place: which element, where its field goes, and putting focus back after. */
function useRename(input: {
  canvas: React.RefObject<HTMLDivElement | null>
  graph: DiagramGraph | null
  onRename: ((id: string, name: string) => void) | undefined
  /** The diagram drawn now: once it changes after a rename, focus goes to what's selected. */
  diagram: UmlSpec
}) {
  const { canvas, graph, onRename, diagram } = input
  const [target, setTarget] = React.useState<RenameTarget | null>(null)
  const refocus = React.useRef(false)
  const nodeEl = (id: string) =>
    canvas.current?.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(id)}"]`)

  React.useEffect(() => {
    // The renamed element may have a new id: focus what's selected once React Flow drew it.
    if (!refocus.current) return
    refocus.current = false
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const el = canvas.current?.querySelector<HTMLElement>('.react-flow__node.selected')
        ;(el ?? canvas.current)?.focus()
      })
    })
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [diagram, canvas])

  const start = (id: string) => {
    const node = graph?.nodes.find((n) => n.id === id)
    const el = nodeEl(id)
    const host = canvas.current?.getBoundingClientRect()
    if (!onRename || !node || !el || !host) return
    const r = el.getBoundingClientRect()
    const value = node.title ? node.title : (node.body ?? '')
    setTarget({
      id,
      value,
      left: r.left - host.left,
      top: r.top - host.top,
      width: Math.max(160, r.width),
    })
  }

  const done = (value: string | null) => {
    if (!target) return
    setTarget(null)
    const next = value?.trim()
    if (next && next !== target.value) {
      refocus.current = true
      onRename?.(target.id, next)
    } else nodeEl(target.id)?.focus()
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'F2' || !(event.target instanceof Element)) return
    const id = event.target.closest('.react-flow__node')?.getAttribute('data-id')
    if (!id) return
    event.preventDefault()
    start(id)
  }

  return { target, start, done, onKeyDown }
}

export {
  AlignBar,
  CanvasControls,
  dropHandlers,
  type Fullscreen,
  FullscreenButton,
  RenameField,
  type RenameTarget,
  useFullscreen,
  useRename,
}
