'use client'

// Coreloom UI — UmlDiagram annotations. A status laid over a diagram's elements, such as the
// findings of a review that compared the drawing with the code: a ring around the element in the
// status colour and a small badge on its corner. With `onAnnotationSelect`, the badge is a button
// that hands the element's id back (the app shows that element's findings). UmlDiagram and
// SequenceDiagramView draw them; the app only passes the list.
import { useStore } from '@xyflow/react'
import {
  CircleCheckIcon,
  CircleHelpIcon,
  CircleXIcon,
  type LucideIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { type Messages, useCoreloomI18n } from '@/lib/i18n'
import type { SequenceLayout } from '@/lib/uml-sequence'
import { cn } from '@/lib/utils'

/** `ok`: nothing to report; `warning`: a gap; `error`: wrong or missing; `unknown`: not checked. */
type UmlAnnotationStatus = 'ok' | 'warning' | 'error' | 'unknown'

interface UmlAnnotation {
  /**
   * The element's id in the diagram: a class, a box, a participant, or a sequence step
   * (`step:2`).
   */
  element: string
  status: UmlAnnotationStatus
  /** How many findings it stands for; the badge shows the number from 2. */
  count?: number
  /** A few words on what was found ("Missing from the code"). Default: the status's name. */
  label?: string
}

type AnnotationText = Messages['diagramAnnotations']

const ICON: Record<UmlAnnotationStatus, LucideIcon> = {
  ok: CircleCheckIcon,
  warning: TriangleAlertIcon,
  error: CircleXIcon,
  unknown: CircleHelpIcon,
}

const VARIANT = {
  ok: 'success',
  warning: 'warning',
  error: 'destructive',
  unknown: 'secondary',
} as const

/** The ring around an annotated box on the canvas (a selected box keeps the selection's ring). */
const RING: Record<UmlAnnotationStatus, string> = {
  ok: 'ring-2 ring-success',
  warning: 'ring-2 ring-warning',
  error: 'ring-2 ring-destructive',
  unknown: 'ring-2 ring-border-strong',
}

/** The stroke of an annotated participant or message in a sequence diagram. */
const STROKE: Record<UmlAnnotationStatus, string> = {
  ok: 'var(--color-success)',
  warning: 'var(--color-warning)',
  error: 'var(--color-destructive)',
  unknown: 'var(--color-fg-secondary)',
}

/** The annotations by element id; the last one wins when an id comes twice. */
function annotationMap(
  annotations: readonly UmlAnnotation[] | undefined,
): ReadonlyMap<string, UmlAnnotation> {
  return new Map((annotations ?? []).map((a) => [a.element, a]))
}

/** "Missing from the code, 3 findings": what an annotation says, in words. */
function annotationText(annotation: UmlAnnotation, t: AnnotationText): string {
  const what = annotation.label ?? t.status[annotation.status]
  const count = annotation.count ?? 1
  return count > 1 ? t.withCount(what, count) : what
}

interface AnnotationScope {
  /** Hands an element's id back when its badge is pressed; without it, badges are only drawn. */
  onSelect: ((element: string) => void) | undefined
  /** A thumbnail: badges shrink with the drawing instead of keeping their size. */
  preview?: boolean
}

const AnnotationContext = React.createContext<AnnotationScope>({ onSelect: undefined })

/** What a drawing needs to lay the annotations over its elements. */
interface AnnotationLayer {
  marks: ReadonlyMap<string, UmlAnnotation>
  scope: AnnotationScope
  t: AnnotationText
}

/**
 * The annotations to draw: none while an image is made (the image shows the diagram itself), and
 * badges that are only marks on a thumbnail.
 */
function useAnnotationLayer({
  annotations,
  onAnnotationSelect,
  exporting,
  preview,
}: {
  annotations: readonly UmlAnnotation[] | undefined
  onAnnotationSelect: ((element: string) => void) | undefined
  exporting: boolean
  preview: boolean
}): AnnotationLayer {
  const t = useCoreloomI18n().messages.diagramAnnotations
  return {
    marks: annotationMap(exporting ? undefined : annotations),
    scope: { onSelect: preview ? undefined : onAnnotationSelect, preview },
    t,
  }
}

/** The badge on an element's corner: a button when the app listens, a mark otherwise. */
function AnnotationBadge({
  annotation,
  name,
  className,
  style,
}: {
  annotation: UmlAnnotation
  /** The element's name, for the button's accessible name. */
  name: string
  className?: string
  style?: React.CSSProperties
}) {
  const t = useCoreloomI18n().messages.diagramAnnotations
  const { onSelect } = React.use(AnnotationContext)
  const Icon = ICON[annotation.status]
  const count = annotation.count ?? 1
  const content = (
    <>
      <Icon aria-hidden />
      {count > 1 && <span>{count}</span>}
    </>
  )
  // 24px high at least: a target a finger can hit.
  const look = 'h-6 min-w-6 gap-1 px-1.5 py-0 shadow-sm ring-2 ring-background'
  return (
    <span
      data-slot="uml-annotation"
      data-status={annotation.status}
      // The subtle colours are see-through: the card colour underneath keeps the badge readable.
      className={cn('absolute z-10 rounded-pill bg-card', className)}
      style={style}
    >
      {onSelect ? (
        <Badge asChild variant={VARIANT[annotation.status]} className={look}>
          <button
            type="button"
            // React Flow must not start a drag or a pan from the badge.
            className="nodrag nopan cursor-pointer outline-none"
            aria-label={t.show(name, annotationText(annotation, t))}
            onClick={(event) => {
              event.stopPropagation()
              onSelect(annotation.element)
            }}
          >
            {content}
          </button>
        </Badge>
      ) : (
        <Badge variant={VARIANT[annotation.status]} className={look} aria-hidden>
          {content}
        </Badge>
      )}
    </span>
  )
}

/** What every canvas node receives: its id, and the annotation the canvas found for it. */
interface AnnotatedProps {
  id: string
  data: {
    annotation?: UmlAnnotation | undefined
    node: { title: string; body?: string | undefined }
  }
}

/**
 * A node shape with its annotation's badge on the top right corner. The badge keeps its size at
 * every zoom, so it stays readable and easy to press on a zoomed-out diagram.
 */
function withAnnotation<P extends AnnotatedProps>(Shape: React.ComponentType<P>) {
  function Annotated(props: P) {
    const { annotation, node } = props.data
    const zoom = useStore((s) => s.transform[2])
    const { preview = false } = React.use(AnnotationContext)
    return (
      <>
        <Shape {...props} />
        {annotation && (
          <AnnotationBadge
            {...(preview
              ? {}
              : {
                  style: { transform: `scale(${String(1 / zoom)})`, transformOrigin: 'top right' },
                })}
            annotation={annotation}
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- an empty title falls back too
            name={node.title || node.body || props.id}
            className="-top-2.5 -right-2.5"
          />
        )}
      </>
    )
  }
  return Annotated
}

/** Where a badge goes on a sequence diagram: a participant's top box, or the end of a message. */
function sequenceSpots(layout: SequenceLayout, top: number) {
  const actor = layout.columns.some((c) => c.kind === 'actor')
  const spots = new Map<string, { x: number; y: number; name: string }>()
  for (const col of layout.columns) {
    const box =
      col.kind === 'actor'
        ? { right: col.x + 30, y: 0 }
        : { right: col.x + col.width / 2, y: actor ? 10 : 0 }
    spots.set(col.id, { x: box.right, y: top + box.y, name: col.label })
  }
  const names = new Map(layout.columns.map((c) => [c.id, c.label]))
  for (const item of layout.items) {
    if (item.type !== 'message') continue
    const x = item.self ? item.from + 44 : Math.max(item.from, item.to) - 12
    const name = item.text || `${names.get(item.fromId) ?? ''} → ${names.get(item.toId) ?? ''}`
    spots.set(item.id, { x, y: top + item.y - 14, name: name.replace(/\n/g, ' ') })
  }
  return spots
}

/** The badges over a sequence diagram's SVG, placed on its participants and messages. */
function SequenceAnnotations({
  layout,
  annotations,
  top = 0,
}: {
  layout: SequenceLayout
  annotations: ReadonlyMap<string, UmlAnnotation>
  /** How far below the box's top the drawing starts. */
  top?: number
}) {
  if (!annotations.size) return null
  const spots = sequenceSpots(layout, top)
  return [...annotations.values()].map((annotation) => {
    const spot = spots.get(annotation.element)
    if (!spot) return null
    return (
      <AnnotationBadge
        key={annotation.element}
        annotation={annotation}
        name={spot.name}
        className="-translate-x-1/2 -translate-y-1/2"
        style={{ left: spot.x, top: spot.y }}
      />
    )
  })
}

export {
  RING as ANNOTATION_RING,
  STROKE as ANNOTATION_STROKE,
  AnnotationContext,
  type AnnotationLayer,
  annotationMap,
  annotationText,
  SequenceAnnotations,
  type UmlAnnotation,
  type UmlAnnotationStatus,
  useAnnotationLayer,
  withAnnotation,
}
