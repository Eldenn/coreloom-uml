'use client'

// Coreloom UI — UmlDiagram. Draws a software diagram from Coreloom's UML model: class, state,
// entity–relationship, C4 and the other box-and-line diagrams on a React Flow canvas (laid out automatically, zoomable,
// elements draggable when `editable`), sequence diagrams as an SVG. Feed it JSON you checked with
// `parseUmlJson`, or Mermaid text read with `parseMermaid`. Nothing is rendered as HTML. When
// editable it can also select an area, align the selected boxes, rename in place and take
// elements dropped from a toolbar; its `ref` turns the drawing into an SVG or PNG image. The
// controls can show it full screen; `preview` draws a still thumbnail with one accessible name.
import '@xyflow/react/dist/base.css'

import {
  type Connection,
  ConnectionMode,
  type EdgeChange,
  type NodeChange,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  ViewportPortal,
} from '@xyflow/react'
import * as React from 'react'

import { SequenceDiagramView } from '@/components/ui/sequence-diagram'
import {
  AnnotationContext,
  type UmlAnnotation,
  type UmlAnnotationStatus,
  useAnnotationLayer,
} from '@/components/ui/uml-diagram-annotations'
import {
  canvasMenu,
  type DiagramContextAction,
  DiagramContextMenu,
  sequenceMenu,
  type UmlContextActions,
  type UmlContextPart,
  type UmlContextTarget,
} from '@/components/ui/uml-diagram-context'
import { flowEdges, flowNodes, movedLayout, nextSelection } from '@/components/ui/uml-diagram-flow'
import {
  type DiagramFlowEdge,
  type DiagramFlowNode,
  DiagramMarkers,
  EDGE_TYPES,
  NODE_TYPES,
} from '@/components/ui/uml-diagram-parts'
import {
  AlignBar,
  CanvasControls,
  dropHandlers,
  type Fullscreen,
  FullscreenButton,
  RenameField,
  useFitView,
  useFullscreen,
  useRename,
  useViewAcrossFullscreen,
} from '@/components/ui/uml-diagram-tools'
import { type Messages, useCoreloomI18n } from '@/lib/i18n'
import type { SequenceDiagram, UmlLayout, UmlPoint, UmlSpec } from '@/lib/uml'
import { alignBoxes, type UmlAlignment } from '@/lib/uml-arrange'
import type { UmlSelection } from '@/lib/uml-edit'
import { type DiagramGraph, toDiagramGraph } from '@/lib/uml-graph'
import { canvasImage, elementImage, type UmlImageFormat } from '@/lib/uml-image'
import { type LayoutBox, layoutDiagram } from '@/lib/uml-layout'
import { cn } from '@/lib/utils'

interface UmlDiagramProps {
  diagram: UmlSpec
  /** People can drag elements (and arrange them again). Default: false. */
  editable?: boolean
  /** The positions after a drag or "Arrange", to keep in the diagram's `layout`. */
  onLayoutChange?: (layout: UmlLayout) => void
  /** CSS height of the canvas; the sequence view scrolls past it. Default: 480. */
  height?: number | string
  /** Zoom, fit, arrange and full screen buttons. Default: true. */
  controls?: boolean
  /**
   * A still thumbnail: fitted to its box, no controls, nothing to focus, drag or zoom, and one
   * accessible name (`label`). Default: false.
   */
  preview?: boolean
  /** The accessible name. Default: the diagram's kind ("Class diagram"). */
  label?: string
  /** What's selected (controlled): element ids, and relation indexes in the diagram's list. */
  selection?: UmlSelection
  onSelectionChange?: (selection: UmlSelection) => void
  /**
   * Element ids to point out without selecting them (the active states of a simulation, say): an
   * outline outside the selection ring, so a box can be both. Not drawn in a sequence diagram.
   */
  highlighted?: readonly string[]
  /**
   * With `editable`, each element shows a dot to drag onto another one; this gets both ends, and
   * the app adds the relation to its diagram (`addRelation`).
   */
  onConnect?: (from: string, to: string) => void
  /** Delete or Backspace on the canvas, with what's selected; the app removes it (`deleteItems`). */
  onDelete?: (selection: UmlSelection) => void
  /**
   * With `editable`, F2 or a double click on an element opens a name field over it; this gets
   * the new name (the app renames it, `renameElement`).
   */
  onRename?: (id: string, name: string) => void
  /**
   * With `editable`, something dragged with the `UML_DRAG_TYPE` data (an element type) and
   * dropped on the canvas; gets the type and where it was dropped, in diagram coordinates.
   */
  onElementDrop?: (type: string, position: UmlPoint) => void
  /**
   * A status on some elements (the findings of a review against the code, say): a ring in the
   * status colour and a badge on the element's corner. Ids that aren't in the diagram are skipped.
   */
  annotations?: readonly UmlAnnotation[]
  /** Makes each badge a button that hands its element's id back (the app shows its findings). */
  onAnnotationSelect?: (element: string) => void
  /**
   * The app's entries in the menu a right-click, a long press or the context-menu key opens on an
   * element, a member, a relation or a sequence step, after the drawing's own ones (with
   * `editable`: Rename, Duplicate, Delete, those wired). Without it, or when both lists are
   * empty, no menu opens and the browser's own stays.
   */
  contextActions?: UmlContextActions
  /** With `editable` and `contextActions`, the menu's Duplicate on an element. */
  onDuplicate?: (selection: UmlSelection) => void
  /**
   * With `editable` and `contextActions`, the menu's Delete on a member: the element's id and the
   * member's place in its list (attributes, then methods).
   */
  onMemberDelete?: (element: string, index: number) => void
  /** `toImage` draws the diagram as it shows now into an SVG or PNG data URL (`{ light: true }`: in the light theme). */
  ref?: React.Ref<UmlDiagramHandle>
  className?: string
}

interface UmlImageOptions {
  /** Draws it in the light theme whatever the page's: for paper. */
  light?: boolean
}

interface UmlDiagramHandle {
  toImage: (format: UmlImageFormat, options?: UmlImageOptions) => Promise<string>
}

const NOTHING: UmlSelection = { elements: [], relations: [] }

/** The diagrams drawn on the canvas (every kind but sequence). */
type GraphDiagram = Exclude<UmlSpec, SequenceDiagram>

/** The selection, controlled or not; both of React Flow's change streams update it in turn. */
function useSelection(
  controlled: UmlSelection | undefined,
  onChange: ((selection: UmlSelection) => void) | undefined,
) {
  const [own, setOwn] = React.useState<UmlSelection>(NOTHING)
  const current = controlled ?? own
  // Node and edge changes for one click arrive one after the other, before a render.
  const latest = React.useRef(current)
  React.useEffect(() => {
    latest.current = current
  }, [current])
  const update = (next: UmlSelection | null) => {
    if (!next) return
    latest.current = next
    setOwn(next)
    onChange?.(next)
  }
  return { selection: current, latest, update }
}

/** Resolves after two frames: React Flow has drawn what the last render changed. */
function nextFrames(): Promise<void> {
  return new Promise((done) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        done()
      })
    })
  })
}

/** The boxes to align: the selected ones that share the first one's frame. */
function alignable(
  ids: readonly string[],
  boxes: Map<string, LayoutBox>,
  graph: DiagramGraph | null,
) {
  const parentOf = new Map(graph?.nodes.map((n) => [n.id, n.parent]) ?? [])
  const first = ids.find((id) => boxes.has(id))
  if (first === undefined) return []
  const frame = parentOf.get(first)
  return ids.flatMap((id) => {
    const box = boxes.get(id)
    return box && parentOf.get(id) === frame ? [{ id, ...box }] : []
  })
}

/** Positions: those dragged here win over the diagram's own until it hands new ones back. */
function usePositions(layout: UmlLayout | undefined, graph: DiagramGraph | null) {
  const [dragged, setDragged] = React.useState<UmlLayout | null>(null)
  // New positions from the app (an undo, say) replace the ones dragged here.
  const handed = JSON.stringify(layout ?? null)
  const [seen, setSeen] = React.useState(handed)
  if (seen !== handed) {
    setSeen(handed)
    setDragged(null)
  }
  const fixed = React.useMemo(() => dragged ?? layout ?? {}, [dragged, layout])
  const boxes = React.useMemo(
    () =>
      graph
        ? layoutDiagram({
            nodes: graph.nodes,
            edges: graph.edges,
            direction: graph.direction,
            fixed,
          })
        : new Map<string, LayoutBox>(),
    [graph, fixed],
  )
  return { fixed, boxes, setDragged }
}

/** The image handle: the drawing as an image, without the selection. */
function useCanvasImage({
  ref,
  canvas,
  setExporting,
}: {
  ref: React.Ref<UmlDiagramHandle> | undefined
  canvas: React.RefObject<HTMLDivElement | null>
  /** True while an image is made, so the selection isn't in it. */
  setExporting: (on: boolean) => void
}) {
  React.useImperativeHandle(ref, () => ({
    toImage: async (format, options) => {
      setExporting(true)
      try {
        await nextFrames()
        return await canvasImage(canvas.current, { format, ...options })
      } finally {
        setExporting(false)
      }
    },
  }))
}

/** What React Flow's own live region and descriptions say, in the reader's language. */
function a11yConfig(t: Messages['diagram'], editable: boolean, renamable: boolean) {
  return {
    'node.a11yDescription.default': editable
      ? [t.a11y.node, renamable ? t.renameHint : ''].filter(Boolean).join(' ')
      : t.a11y.readOnlyNode,
    'node.a11yDescription.keyboardDisabled': t.a11y.readOnlyNode,
    'node.a11yDescription.ariaLiveMessage': ({
      x,
      y,
    }: {
      direction: string
      x: number
      y: number
    }) => t.a11y.moved(Math.round(x), Math.round(y)),
    'edge.a11yDescription.default': t.a11y.edge,
    'handle.ariaLabel': t.a11y.handle,
  }
}

/** The title, the canvas buttons, and the align bar while several boxes are selected. */
function CanvasPanels({
  title,
  controls,
  editable,
  selecting,
  onSelecting,
  onArrange,
  aligning,
  onAlign,
  fullscreen,
}: {
  title: string | undefined
  controls: boolean
  editable: boolean
  selecting: boolean
  onSelecting: (on: boolean) => void
  onArrange: () => void
  /** How many selected boxes can be aligned. */
  aligning: number
  onAlign: (how: UmlAlignment) => void
  fullscreen: Fullscreen | null
}) {
  return (
    <>
      {title && (
        <Panel position="top-left" className="!m-3 max-w-[60%]">
          <p className="truncate text-[13px] font-semibold text-foreground">{title}</p>
        </Panel>
      )}
      {controls && (
        <CanvasControls
          editable={editable}
          selecting={selecting}
          onSelecting={onSelecting}
          onArrange={onArrange}
          fullscreen={fullscreen}
        />
      )}
      {aligning > 1 && <AlignBar count={aligning} onAlign={onAlign} />}
    </>
  )
}

/** React Flow's changes, read back: positions, the selection, new lines, deletions. */
function useCanvasChanges(input: {
  fixed: UmlLayout
  setDragged: (layout: UmlLayout) => void
  controlled: UmlSelection | undefined
  onSelectionChange: ((selection: UmlSelection) => void) | undefined
  canvas: React.RefObject<HTMLDivElement | null>
  onLayoutChange: ((layout: UmlLayout) => void) | undefined
  onConnect: ((from: string, to: string) => void) | undefined
  onDelete: ((selection: UmlSelection) => void) | undefined
}) {
  const { fixed, setDragged, canvas, onLayoutChange, onConnect, onDelete } = input
  // `latest`: the selection as of the last change (two change streams arrive between renders).
  const {
    selection: current,
    latest: selection,
    update,
  } = useSelection(input.controlled, input.onSelectionChange)
  return {
    selection: current,
    select: update,
    moveTo: (next: UmlLayout) => {
      setDragged(next)
      onLayoutChange?.(next)
    },
    onNodesChange: (changes: NodeChange<DiagramFlowNode>[]) => {
      const next = movedLayout(changes, fixed)
      if (next) {
        setDragged(next)
        const done = changes.some((c) => c.type === 'position' && !c.dragging)
        if (done) onLayoutChange?.(next)
      }
      update(nextSelection(selection.current, changes, 'elements'))
    },
    onEdgesChange: (changes: EdgeChange<DiagramFlowEdge>[]) => {
      update(nextSelection(selection.current, changes, 'relations'))
    },
    connect: (c: Connection) => {
      if (c.source && c.target) onConnect?.(c.source, c.target)
    },
    remove: () => {
      const now = selection.current
      if (now.elements.length || now.relations.length) {
        // A focused element or line is about to go: move focus to the canvas first. Waiting for
        // it to disappear is a guess, since the app hands the new diagram back when it wants.
        if (document.activeElement?.closest('.react-flow__node, .react-flow__edge'))
          canvas.current?.focus()
        onDelete?.(now)
        // Anything else that held focus and goes with the selection (the align bar).
        requestAnimationFrame(() => {
          if (!canvas.current?.contains(document.activeElement)) canvas.current?.focus()
        })
      }
      // React Flow's own deletion is off: the diagram changes when the app hands a new one back.
      return Promise.resolve(false)
    },
  }
}

/** A still thumbnail: nothing to focus, select, drag, pan or zoom, and the page scrolls over it. */
const STILL = {
  nodesFocusable: false,
  edgesFocusable: false,
  elementsSelectable: false,
  panOnDrag: false,
  zoomOnScroll: false,
  zoomOnPinch: false,
  zoomOnDoubleClick: false,
  preventScrolling: false,
  minZoom: 0.02,
} as const

/** A thumbnail is still and hidden (its box carries the name); otherwise the canvas is named. */
function canvasNaming(preview: boolean, label: string, title: string | undefined) {
  if (preview) return { flow: { ...STILL, 'aria-hidden': true }, title: undefined }
  return { flow: { 'aria-label': label }, title }
}

type CanvasProps = Omit<UmlDiagramProps, 'diagram' | 'preview'> & {
  diagram: GraphDiagram
  preview: boolean
  /** Fit again when the box changes size. */
  refit: boolean
  fullscreen: Fullscreen | null
}

/** Any diagram but a sequence one (class to package) on a React Flow canvas. */
function DiagramCanvas(props: CanvasProps) {
  const {
    diagram,
    editable = false,
    onLayoutChange,
    controls = true,
    preview,
    refit,
    fullscreen,
    label,
    selection: selectionProp,
    onSelectionChange,
    highlighted,
    onConnect,
    onDelete,
    onRename,
    onElementDrop,
    annotations,
    onAnnotationSelect,
    ref,
  } = props
  const { messages } = useCoreloomI18n()
  const t = messages.diagram
  const markers = `uml${React.useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const graph = React.useMemo(() => toDiagramGraph(diagram), [diagram])
  const [selecting, setSelecting] = React.useState(false)
  const canvas = React.useRef<HTMLDivElement>(null)
  const { fixed, boxes, setDragged } = usePositions(diagram.layout, graph)
  const change = useCanvasChanges({
    fixed,
    setDragged,
    controlled: selectionProp,
    onSelectionChange,
    canvas,
    onLayoutChange,
    onConnect,
    onDelete,
  })
  const { selection } = change
  const connectable = editable && Boolean(onConnect)
  // While an image is made, nothing is drawn as selected or pointed out.
  const [exporting, setExporting] = React.useState(false)
  const shown = exporting ? NOTHING : selection
  const selected = new Set(shown.elements)
  const layer = useAnnotationLayer({ annotations, onAnnotationSelect, exporting, preview })
  const nodes = graph
    ? flowNodes({ graph, boxes, editable, connectable, selected, highlighted, exporting, layer, t })
    : []
  const pickedLines = new Set(shown.relations)
  const edges = graph ? flowEdges({ graph, markers, selected: pickedLines, t }) : []

  const flow = useReactFlow()
  const rename = useRename({ canvas, graph, onRename: editable ? onRename : undefined, diagram })
  useCanvasImage({ ref, canvas, setExporting })
  useFitView(canvas, nodes.map((n) => n.id).join('\u0000'), refit)
  useViewAcrossFullscreen(fullscreen)

  const toAlign = editable ? alignable(selection.elements, boxes, graph) : []
  const align = (how: UmlAlignment) => {
    change.moveTo({ ...fixed, ...alignBoxes(toAlign, how) })
  }

  const ariaLabelConfig = a11yConfig(t, editable, Boolean(onRename))
  const naming = canvasNaming(preview, label ?? t.kinds[diagram.kind], diagram.title)
  const menu = canvasMenu({ ...props, graph, rename, selection, select: change.select, messages })

  return (
    <AnnotationContext value={layer.scope}>
      <DiagramContextMenu {...menu}>
        <ReactFlow<DiagramFlowNode, DiagramFlowEdge>
          ref={canvas}
          tabIndex={-1}
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          onNodesChange={change.onNodesChange}
          onEdgesChange={change.onEdgesChange}
          onConnect={change.connect}
          onBeforeDelete={change.remove}
          onNodeDoubleClick={(_, node) => {
            rename.start(node.id)
          }}
          onKeyDown={rename.onKeyDown}
          {...(editable ? dropHandlers(onElementDrop, flow.screenToFlowPosition) : {})}
          nodesDraggable={editable}
          nodesConnectable={connectable}
          connectionMode={ConnectionMode.Loose}
          nodesFocusable
          edgesFocusable
          elementsSelectable
          selectionOnDrag={selecting}
          panOnDrag={!selecting}
          zoomOnDoubleClick={!(editable && onRename)}
          deleteKeyCode={onDelete ? ['Delete', 'Backspace'] : null}
          // A selected frame must stay behind what it holds.
          elevateNodesOnSelect={false}
          fitView
          fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
          minZoom={0.15}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          ariaLabelConfig={ariaLabelConfig}
          {...naming.flow}
        >
          <ViewportPortal>
            {/* Inside the viewport, so an exported image keeps the arrowheads. */}
            <DiagramMarkers prefix={markers} />
          </ViewportPortal>
          <CanvasPanels
            title={naming.title}
            controls={controls}
            fullscreen={fullscreen}
            editable={editable}
            selecting={selecting}
            onSelecting={setSelecting}
            onArrange={() => {
              change.moveTo({})
            }}
            aligning={toAlign.length}
            onAlign={align}
          />
        </ReactFlow>
      </DiagramContextMenu>
      {rename.target && (
        <RenameField
          key={rename.target.id}
          target={rename.target}
          label={t.rename(rename.target.value)}
          onDone={rename.done}
        />
      )}
      {!nodes.length && (
        <p className="pointer-events-none absolute inset-0 grid place-items-center text-[13px] text-muted-foreground">
          {t.empty}
        </p>
      )}
    </AnnotationContext>
  )
}

/**
 * Where the app's classes go: on the frame, except for a thumbnail, whose box is the drawing
 * itself (its border and background are the ones to change). Full screen drops the border.
 */
function sequenceClasses(preview: boolean, full: boolean, className: string | undefined) {
  if (preview) return { outer: 'h-full', inner: className }
  return { outer: className, inner: full ? 'h-full rounded-none border-0' : undefined }
}

/** A sequence diagram, with the same `ref` as the canvas: its SVG as an image. */
function SequencePane({
  diagram,
  height,
  label,
  className,
  selection,
  onSelectionChange,
  preview = false,
  annotations,
  onAnnotationSelect,
  fullscreen,
  frame,
  ref,
  ...edits
}: UmlDiagramProps & {
  diagram: SequenceDiagram
  fullscreen: Fullscreen | null
  frame: React.Ref<HTMLDivElement>
}) {
  const { messages } = useCoreloomI18n()
  const root = React.useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = React.useState(false)
  const layer = useAnnotationLayer({ annotations, onAnnotationSelect, exporting, preview })
  React.useImperativeHandle(ref, () => ({
    toImage: async (format, options) => {
      const el = root.current
      if (!el) throw new Error('Nothing drawn yet')
      setExporting(true)
      try {
        await nextFrames()
        return await elementImage(el, format, {
          ...options,
          width: el.scrollWidth,
          height: el.scrollHeight,
          style: { maxHeight: 'none', overflow: 'visible', border: 'none', borderRadius: '0' },
        })
      } finally {
        setExporting(false)
      }
    },
  }))
  const select = onSelectionChange
    ? (id: string | null, additive: boolean) => {
        const now = selection?.elements ?? []
        let elements: string[] = id ? [id] : []
        if (id && additive) elements = now.includes(id) ? now.filter((x) => x !== id) : [...now, id]
        onSelectionChange({ elements, relations: [] })
      }
    : undefined
  const full = fullscreen?.active ?? false
  const classes = sequenceClasses(preview, full, className)
  const menu = sequenceMenu({
    ...edits,
    diagram,
    preview,
    selection,
    select: onSelectionChange,
    messages,
  })
  return (
    <DiagramContextMenu {...menu}>
      <div ref={frame} data-slot="uml-diagram" className={cn('relative', classes.outer)}>
        <SequenceDiagramView
          ref={root}
          diagram={diagram}
          {...(height === undefined || full ? {} : { maxHeight: height })}
          {...(label ? { label } : {})}
          {...(classes.inner ? { className: classes.inner } : {})}
          {...(selection && !exporting ? { selected: selection.elements } : {})}
          {...(select && !preview ? { onSelect: select } : {})}
          annotations={[...layer.marks.values()]}
          onAnnotationSelect={layer.scope.onSelect}
          fit={preview}
        />
        {fullscreen && (
          <FullscreenButton fullscreen={fullscreen} className="absolute top-2 right-2" />
        )}
      </div>
    </DiagramContextMenu>
  )
}

/**
 * A class, state, ER, C4, use case, activity, deployment, component or package diagram on a
 * canvas, or a sequence diagram as an SVG.
 */
function UmlDiagram(props: UmlDiagramProps) {
  const { diagram, height = 480, className, preview = false, controls = true } = props
  const frame = React.useRef<HTMLDivElement>(null)
  const screen = useFullscreen(frame)
  const kinds = useCoreloomI18n().messages.diagram.kinds
  const fullscreen = controls && !preview ? screen : null
  if (diagram.kind === 'sequence')
    return (
      <SequencePane
        {...props}
        diagram={diagram}
        height={height}
        fullscreen={fullscreen}
        frame={frame}
      />
    )
  return (
    <div
      ref={frame}
      data-slot="uml-diagram"
      className={cn(
        'relative overflow-hidden rounded-lg border border-border bg-background',
        preview && 'pointer-events-none',
        className,
      )}
      style={{ height, '--diagram-edge': 'var(--color-muted-foreground)' } as React.CSSProperties}
      {...(preview ? { role: 'img', 'aria-label': props.label ?? kinds[diagram.kind] } : {})}
    >
      <ReactFlowProvider>
        <DiagramCanvas
          {...props}
          diagram={diagram}
          editable={Boolean(props.editable) && !preview}
          preview={preview}
          refit={preview || Boolean(fullscreen?.active)}
          controls={controls && !preview}
          fullscreen={fullscreen}
        />
      </ReactFlowProvider>
    </div>
  )
}

export {
  type DiagramContextAction,
  type UmlAnnotation,
  type UmlAnnotationStatus,
  type UmlContextActions,
  type UmlContextPart,
  type UmlContextTarget,
  UmlDiagram,
  type UmlDiagramHandle,
  type UmlDiagramProps,
}
