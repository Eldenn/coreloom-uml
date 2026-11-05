import * as React from 'react'

import {
  clipboardCommands,
  editCommands,
  layoutCommands,
  relationCount,
  stepCommands,
} from '@/components/diagram-commands'
import type { Messages } from '@/lib/i18n'
import { toUmlJson, type UmlLayout, type UmlPoint, type UmlSpec } from '@/lib/uml'
import {
  addElement,
  canDelete,
  takenIds,
  type UmlElementType,
  type UmlRelationType,
  type UmlSelection,
} from '@/lib/uml-edit'
import type { UmlClip } from '@/lib/uml-edit-clipboard'
import { elementFields } from '@/lib/uml-edit-fields'
import { stepOf } from '@/lib/uml-edit-sequence'

const NOTHING: UmlSelection = { elements: [], relations: [] }

/** A text as it was before a change, with the positions dragged then. */
interface Snapshot {
  text: string
  layout: UmlLayout | null
}

interface History {
  past: Snapshot[]
  future: Snapshot[]
}

const EMPTY: History = { past: [], future: [] }
/** Enough to undo a working session; older steps are dropped. */
const DEPTH = 100

/** The part of a selection the diagram still has (after a text edit, say). */
function present(d: UmlSpec, selection: UmlSelection): UmlSelection {
  const ids = takenIds(d)
  const has = (id: string) =>
    ids.has(id) || elementFields(d, id) !== null || (d.kind === 'sequence' && stepOf(d, id))
  const elements = selection.elements.filter(has)
  const relations = selection.relations.filter((i) => i < relationCount(d))
  if (
    elements.length === selection.elements.length &&
    relations.length === selection.relations.length
  )
    return selection
  return { elements, relations }
}

/** Where a dropped element lands: its top left a little up and left of the pointer. */
const DROP_OFFSET = { x: 60, y: 20 }

function useDiagramEditing({
  diagram,
  text,
  layout,
  write,
  setText,
  setLayout,
  t,
}: {
  /** The diagram as drawn (with dragged positions); null when the text can't be read. */
  diagram: UmlSpec | null
  text: string
  layout: UmlLayout | null
  /** The diagram as text in the current format. */
  write: (diagram: UmlSpec) => string
  setText: (text: string) => void
  setLayout: (layout: UmlLayout | null) => void
  t: Messages['diagramTools']
}) {
  const [selected, setSelected] = React.useState<UmlSelection>(NOTHING)
  const [history, setHistory] = React.useState<History>(EMPTY)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [lastType, setLastType] = React.useState<UmlRelationType | null>(null)
  const [clip, setClip] = React.useState<UmlClip | null>(null)
  const nameRef = React.useRef<HTMLInputElement>(null)
  // The sequence step list's buttons, by step id.
  const stepButtons = React.useRef(new Map<string, HTMLButtonElement>())
  // An element or step just added: its name field (or its button) takes focus once shown.
  const focusNext = React.useRef<string | null>(null)
  const selection = diagram ? present(diagram, selected) : NOTHING

  React.useEffect(() => {
    const id = focusNext.current
    if (!id || !diagram) return
    const step = diagram.kind === 'sequence' && stepOf(diagram, id)
    if (!step && !elementFields(diagram, id)) return
    // After a menu that closed has given focus back to its button. Cleared only once done: a
    // render in between cancels this timer and the next one takes over.
    const timer = window.setTimeout(() => {
      focusNext.current = null
      if (step) {
        stepButtons.current.get(id)?.focus()
        return
      }
      nameRef.current?.focus()
      nameRef.current?.select()
    }, 0)
    return () => {
      window.clearTimeout(timer)
    }
  }, [diagram])

  const apply = (next: UmlSpec, message: string, select: UmlSelection) => {
    if (!diagram || toUmlJson(next) === toUmlJson(diagram)) return
    setHistory((h) => ({ past: [...h.past.slice(1 - DEPTH), { text, layout }], future: [] }))
    setText(write(next))
    setLayout(next.kind === 'sequence' ? null : (next.layout ?? null))
    setSelected(select)
    setNotice(message)
  }

  const step = (direction: 'undo' | 'redo') => {
    const from = direction === 'undo' ? history.past : history.future
    const target = direction === 'undo' ? from.at(-1) : from[0]
    if (!target) return
    const now = { text, layout }
    setHistory(
      direction === 'undo'
        ? { past: history.past.slice(0, -1), future: [now, ...history.future] }
        : { past: [...history.past, now], future: history.future.slice(1) },
    )
    setText(target.text)
    setLayout(target.layout)
    setNotice(direction === 'undo' ? t.undone : t.redone)
  }

  /** Adds an element of `type`; dropped on the canvas, it lands where it was dropped. */
  const add = (type: UmlElementType, at?: UmlPoint) => {
    if (!diagram) return
    const name = t.elements[type]
    const result = addElement(diagram, { type, name, near: selection.elements.at(0) })
    let next = result.diagram
    if (at && next.kind !== 'sequence') {
      const place = { x: at.x - DROP_OFFSET.x, y: at.y - DROP_OFFSET.y }
      next = { ...next, layout: { ...next.layout, [result.id]: place } }
    }
    focusNext.current = result.id
    apply(next, t.added(name), { elements: [result.id], relations: [] })
  }

  const input = { diagram, selection, apply, t }
  return {
    selection,
    select: setSelected,
    notice,
    nameRef,
    stepButtons,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    canDelete: diagram ? canDelete(diagram, selection) : false,
    undo: () => {
      step('undo')
    },
    redo: () => {
      step('redo')
    },
    add,
    ...editCommands(input, lastType, setLastType),
    ...stepCommands(input),
    ...clipboardCommands(input, clip, setClip, setNotice),
    ...layoutCommands(input),
    /** The person typed, switched format or started again: the tools' history no longer applies. */
    reset: () => {
      setHistory(EMPTY)
      setNotice(null)
    },
  }
}

export { useDiagramEditing }
