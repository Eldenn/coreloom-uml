'use client'

// Coreloom UI — DiagramContextMenu. The menu a right-click, a long press, or the context-menu key
// (or Shift+F10) on a focused target opens in a drawing or a list of views: the component's own
// actions for what's under the pointer, a separator, then the app's. Nothing to show for a
// target: no menu opens, and the browser's own menu stays.
import { CopyPlusIcon, PencilIcon, Trash2Icon } from 'lucide-react'
import * as React from 'react'

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  type GraphHit,
  graphTarget,
  sequenceTarget,
  type UmlContextPart,
  type UmlContextTarget,
} from '@/components/ui/uml-diagram-labels'
import type { Messages } from '@/lib/i18n'
import type { SequenceDiagram, UmlSpec } from '@/lib/uml'
import { canDelete, type UmlSelection } from '@/lib/uml-edit'
import { canCopy } from '@/lib/uml-edit-clipboard'
import { type DiagramGraph, type DiagramNode, relationIndexOf } from '@/lib/uml-graph'

/** One entry of a context menu. */
interface DiagramContextAction {
  label: string
  icon?: React.ReactNode
  /** Drawn in the destructive colour (a deletion). */
  destructive?: boolean
  disabled?: boolean
  onSelect: () => void
}

/** The component's own entries, then the app's. */
interface DiagramContextLists {
  own: readonly DiagramContextAction[]
  app: readonly DiagramContextAction[]
}

interface Shown<T> {
  target: T
  lists: DiagramContextLists
}

/** What a drawing can do to a target by itself; each is offered only when it is wired. */
interface DrawingEdits {
  /** Opens the drawing's own name field over the element. */
  rename?: ((id: string) => void) | undefined
  onDuplicate?: ((selection: UmlSelection) => void) | undefined
  onDelete?: ((selection: UmlSelection) => void) | undefined
  onMemberDelete?: ((element: string, index: number) => void) | undefined
}

/**
 * A drawing's own entries for a target: Rename, Duplicate and Delete, those it can do. Several
 * selected parts are duplicated and deleted together, and have no Rename.
 */
function drawingActions(
  diagram: UmlSpec,
  target: UmlContextTarget,
  edits: DrawingEdits,
  t: Messages['diagramTools'],
): DiagramContextAction[] {
  const { rename, onDuplicate, onDelete, onMemberDelete } = edits
  const remove = (run: () => void): DiagramContextAction => ({
    label: t.delete,
    icon: <Trash2Icon aria-hidden />,
    destructive: true,
    onSelect: run,
  })
  if (target.type === 'member')
    return onMemberDelete
      ? [
          remove(() => {
            onMemberDelete(target.element, target.index)
          }),
        ]
      : []
  const only = selectionOf(target)
  const out: DiagramContextAction[] = []
  if (target.type === 'element' && rename)
    out.push({
      label: t.rename,
      icon: <PencilIcon aria-hidden />,
      onSelect: () => {
        rename(target.id)
      },
    })
  if (
    (target.type === 'element' || target.type === 'selection') &&
    onDuplicate &&
    canCopy(diagram, only)
  )
    out.push({
      label: t.duplicate,
      icon: <CopyPlusIcon aria-hidden />,
      onSelect: () => {
        onDuplicate(only)
      },
    })
  if (onDelete && canDelete(diagram, only))
    out.push(
      remove(() => {
        onDelete(only)
      }),
    )
  return out
}

/** The app's entries for a target of a drawing. */
type UmlContextActions = (target: UmlContextTarget) => readonly DiagramContextAction[]

/** What a canvas element stands for: a line, a box, or a row of a box. */
function canvasHit(element: Element): GraphHit {
  const edge = element.closest('.react-flow__edge')?.getAttribute('data-id')
  if (edge) return { edge }
  const node = element.closest('.react-flow__node')?.getAttribute('data-id') ?? undefined
  const member = element.closest('[data-member]')?.getAttribute('data-member')
  return { node, member: member === null || member === undefined ? undefined : Number(member) }
}

/** The id under an element of a sequence drawing; on the drawing itself, the first selected. */
function sequenceHit(element: Element, selected: readonly string[]): string | null {
  const id = element.closest('[data-id]')?.getAttribute('data-id')
  if (id) return id
  return selected[0] ?? null
}

/** Whether a target is already part of a selection. */
function isSelected(target: UmlContextTarget, selection: UmlSelection): boolean {
  if (target.type === 'selection') return true
  if (target.type === 'relation') return selection.relations.includes(target.index)
  return selection.elements.includes(target.type === 'member' ? target.element : target.id)
}

/** A selection of the target alone (a member's element); of several parts, theirs. */
function selectionOf(target: UmlContextTarget): UmlSelection {
  if (target.type === 'selection') return target.selection
  if (target.type === 'relation') return { elements: [], relations: [target.index] }
  return { elements: [target.type === 'member' ? target.element : target.id], relations: [] }
}

/** The drawing's props a context menu reads (UmlDiagram's), and its i18n messages. */
interface DrawingMenuInput extends Omit<DrawingEdits, 'rename'> {
  diagram: UmlSpec
  /** The drawing can be changed: its own entries are offered. */
  editable?: boolean | undefined
  /** A thumbnail: no menu. */
  preview?: boolean | undefined
  contextActions?: UmlContextActions | undefined
  onRename?: ((id: string, name: string) => void) | undefined
  selection?: UmlSelection | undefined
  /** Absent when nothing can be selected. */
  select?: ((selection: UmlSelection) => void) | undefined
  messages: Messages
}

const NOTHING: UmlSelection = { elements: [], relations: [] }

/** The context menu's wiring for a drawing, once it knows how to find a target. */
function drawingMenu(
  input: DrawingMenuInput,
  resolve: (element: Element) => UmlContextPart | null,
  /** The parts a selection holds, elements then relations; what the drawing lacks is left out. */
  parts: (selection: UmlSelection) => UmlContextPart[],
  /** Opens the drawing's name field, when it has one. */
  rename?: (id: string) => void,
) {
  const { diagram, contextActions, select, messages } = input
  const selection = input.selection ?? NOTHING
  const edits: DrawingEdits = { ...input, rename: input.onRename && rename }
  // On one of several selected parts, the menu is about all of them.
  const whole = (part: UmlContextPart): UmlContextTarget => {
    if (selection.elements.length + selection.relations.length < 2) return part
    if (!isSelected(part, selection)) return part
    const targets = parts(selection)
    if (targets.length < 2) return part
    return {
      type: 'selection',
      selection,
      targets,
      label: messages.diagramTools.selected(targets.length),
    }
  }
  return {
    enabled: !input.preview && contextActions !== undefined,
    resolve: (element: Element): UmlContextTarget | null => {
      const part = resolve(element)
      return part && whole(part)
    },
    lists: (target: UmlContextTarget) => ({
      own: input.editable ? drawingActions(diagram, target, edits, messages.diagramTools) : [],
      app: contextActions?.(target) ?? [],
    }),
    onOpen: (target: UmlContextTarget) => {
      // The menu acts on what was clicked: anything else selected lets go, unless it's part of it.
      if (select && !isSelected(target, selection)) select(selectionOf(target))
    },
  }
}

/** The context menu of a canvas (every kind but sequence). */
function canvasMenu(
  input: DrawingMenuInput & {
    graph: DiagramGraph | null
    rename: { start: (id: string) => void }
  },
) {
  const { graph, messages } = input
  const role = (node: DiagramNode) => messages.diagram.roles[node.role]
  const at = (hit: GraphHit) => (graph ? graphTarget(graph, hit, role) : null)
  return drawingMenu(
    input,
    (element) => at(canvasHit(element)),
    (selection) =>
      [
        ...selection.elements.map((node) => at({ node })),
        ...selection.relations.map((index) =>
          at({ edge: graph?.edges.find((e) => relationIndexOf(e.id) === index)?.id ?? '' }),
        ),
      ].filter((part) => part !== null),
    input.rename.start,
  )
}

/** The context menu of a sequence drawing. */
function sequenceMenu(input: DrawingMenuInput & { diagram: SequenceDiagram }) {
  const { diagram } = input
  const selected = input.selection?.elements ?? []
  return drawingMenu(
    input,
    (element) => {
      const id = sequenceHit(element, selected)
      return id ? sequenceTarget(diagram, id) : null
    },
    (selection) =>
      selection.elements.map((id) => sequenceTarget(diagram, id)).filter((part) => part !== null),
  )
}

const isMenuKey = (event: React.KeyboardEvent) =>
  event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')

function Entry({ action }: { action: DiagramContextAction }) {
  return (
    <ContextMenuItem
      variant={action.destructive ? 'destructive' : 'default'}
      {...(action.disabled ? { disabled: true } : {})}
      onSelect={action.onSelect}
    >
      {action.icon}
      {action.label}
    </ContextMenuItem>
  )
}

function DiagramContextMenu<T extends { label: string }>({
  enabled,
  resolve,
  lists,
  onOpen,
  children,
}: {
  /** Off: the child is rendered alone and the browser's menu stays. */
  enabled: boolean
  /** The target an element of the child stands for (the one clicked, or the focused one). */
  resolve: (element: Element) => T | null
  lists: (target: T) => DiagramContextLists
  /** The menu opened on `target` (the drawing selects it). */
  onOpen?: (target: T) => void
  /** One element, which gets the menu's handlers. */
  children: React.ReactElement
}) {
  const [shown, setShown] = React.useState<Shown<T> | null>(null)
  // Read when the menu opens, in the same event that found the target.
  const pending = React.useRef<T | null>(null)
  // Where focus goes back to when the menu closes, unless an action moved it.
  const origin = React.useRef<HTMLElement | null>(null)
  const root = React.useRef<HTMLElement>(null)
  if (!enabled) return children

  const find = (element: EventTarget | null): Shown<T> | null => {
    const target = element instanceof Element ? resolve(element) : null
    if (!target) return null
    const found = lists(target)
    return found.own.length || found.app.length ? { target, lists: found } : null
  }
  const hold = (element: EventTarget | null) => {
    const found = find(element)
    pending.current = found?.target ?? null
    origin.current =
      element instanceof Element ? element.closest<HTMLElement>('button, [tabindex]') : null
    setShown(found)
    return found
  }
  const refocus = () => {
    const active = document.activeElement
    if (active && active !== document.body) return
    if (origin.current?.isConnected) {
      origin.current.focus()
      return
    }
    // The target went with the action (a deletion): the drawing or the list itself.
    const host = root.current
    ;(host?.matches('[tabindex]') ? host : host?.querySelector<HTMLElement>('[tabindex]'))?.focus()
  }

  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (open && pending.current) onOpen?.(pending.current)
      }}
    >
      <ContextMenuTrigger
        ref={root}
        asChild
        // Nothing to offer here: the event never reaches the menu, and the browser's opens.
        onContextMenuCapture={(event) => {
          if (!hold(event.target)) event.stopPropagation()
        }}
        // A long press opens the menu without a contextmenu event on some phones.
        onPointerDownCapture={(event) => {
          if (event.pointerType !== 'mouse') hold(event.target)
        }}
        onKeyDown={(event) => {
          if (!isMenuKey(event) || !find(event.target)) return
          event.preventDefault()
          const element = event.target as Element
          const box = element.getBoundingClientRect()
          element.dispatchEvent(
            new MouseEvent('contextmenu', {
              bubbles: true,
              cancelable: true,
              clientX: box.left + box.width / 2,
              clientY: box.top + Math.min(box.height / 2, 24),
            }),
          )
        }}
      >
        {children}
      </ContextMenuTrigger>
      {shown && (
        <ContextMenuContent
          aria-label={shown.target.label}
          className="max-w-80"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            refocus()
          }}
        >
          {shown.lists.own.map((action) => (
            <Entry key={`own-${action.label}`} action={action} />
          ))}
          {shown.lists.own.length > 0 && shown.lists.app.length > 0 && <ContextMenuSeparator />}
          {/* The app's labels may repeat: their place is their key. */}
          {shown.lists.app.map((action, i) => (
            <Entry key={`app-${String(i)}`} action={action} />
          ))}
        </ContextMenuContent>
      )}
    </ContextMenu>
  )
}

export {
  canvasMenu,
  type DiagramContextAction,
  type DiagramContextLists,
  DiagramContextMenu,
  drawingActions,
  type DrawingEdits,
  sequenceMenu,
  type UmlContextActions,
  type UmlContextPart,
  type UmlContextTarget,
}
