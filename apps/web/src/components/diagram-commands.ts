import type { Messages } from '@/lib/i18n'
import type { SequenceStep, UmlDirection, UmlLayout, UmlSpec } from '@/lib/uml'
import { clearLayout, setDirection } from '@/lib/uml-arrange'
import {
  addRelation,
  type AddRelationInput,
  canDelete,
  deleteItems,
  relationTypes,
  type UmlRelationType,
  type UmlSelection,
} from '@/lib/uml-edit'
import { copyItems, duplicateItems, pasteItems, type UmlClip } from '@/lib/uml-edit-clipboard'
import {
  renameElement,
  reverseRelation,
  setElementFields,
  setRelationFields,
  type UmlElementFields,
  type UmlRelationFields,
} from '@/lib/uml-edit-fields'
import {
  addSection,
  insertMessage,
  moveStep,
  removeSection,
  setStep,
  stepPath,
} from '@/lib/uml-edit-sequence'

const NOTHING: UmlSelection = { elements: [], relations: [] }

interface CommandInput {
  /** The diagram as drawn (with dragged positions); null when the text can't be read. */
  diagram: UmlSpec | null
  selection: UmlSelection
  /** Writes `next` as the text, keeps the change for Undo, selects `select`, says `message`. */
  apply: (next: UmlSpec, message: string, select: UmlSelection) => void
  t: Messages['diagramTools']
}

function relationCount(d: UmlSpec): number {
  switch (d.kind) {
    case 'state':
      return d.transitions.length
    case 'sequence':
      return 0
    default:
      return d.relations.length
  }
}

/** Adding lines, deleting, and the properties panel's changes. */
function editCommands(
  { diagram, selection, apply, t }: CommandInput,
  lastType: UmlRelationType | null,
  setLastType: (type: UmlRelationType) => void,
) {
  const connect = (input: AddRelationInput) => {
    if (!diagram) return
    setLastType(input.type)
    if (diagram.kind === 'sequence') {
      // A message goes after the selected step, and is selected.
      const arrow = input.type === 'reply' || input.type === 'async' ? input.type : 'sync'
      const near = selection.elements.find((id) => stepPath(id))
      const added = insertMessage(diagram, { ...input, text: input.label ?? '', arrow }, near)
      apply(added.diagram, t.connected, { elements: [added.id], relations: [] })
      return
    }
    const next = addRelation(diagram, input)
    const index = relationCount(next) - 1
    apply(next, t.connected, index >= 0 ? { elements: [], relations: [index] } : NOTHING)
  }
  return {
    connect,
    /** A line dragged on the canvas: the kind used last, or the usual one. */
    connectDragged: (from: string, to: string) => {
      if (!diagram) return
      connect({ type: lastType ?? relationTypes(diagram).at(0) ?? 'association', from, to })
    },
    remove: (what: UmlSelection = selection) => {
      if (!diagram || !canDelete(diagram, what)) return
      const count = what.elements.length + what.relations.length
      apply(deleteItems(diagram, what), t.deleted(count), NOTHING)
    },
    changeElement: (id: string, fields: UmlElementFields) => {
      if (!diagram) return
      const result = setElementFields(diagram, id, fields)
      apply(result.diagram, t.changed, { elements: [result.id], relations: [] })
    },
    rename: (id: string, name: string) => {
      if (!diagram) return
      const result = renameElement(diagram, id, name)
      apply(result.diagram, t.changed, { elements: [result.id], relations: [] })
    },
    changeRelation: (index: number, fields: UmlRelationFields) => {
      if (diagram) apply(setRelationFields(diagram, index, fields), t.changed, selection)
    },
    reverse: (index: number) => {
      if (diagram) apply(reverseRelation(diagram, index), t.changed, selection)
    },
  }
}

/** A sequence step's form: change it, move it, add or remove a block's section. */
function stepCommands({ diagram, selection, apply, t }: CommandInput) {
  const seq = diagram?.kind === 'sequence' ? diagram : null
  return {
    changeStep: (id: string, step: SequenceStep) => {
      if (seq) apply(setStep(seq, id, step), t.changed, selection)
    },
    moveStep: (id: string, delta: -1 | 1) => {
      if (!seq) return
      const moved = moveStep(seq, id, delta)
      apply(moved.diagram, t.changed, { elements: [moved.id], relations: [] })
    },
    addSection: (id: string) => {
      if (seq) apply(addSection(seq, id), t.changed, selection)
    },
    removeSection: (id: string, index: number) => {
      if (seq) apply(removeSection(seq, id, index), t.changed, selection)
    },
  }
}

/** Copy, cut, paste and duplicate, with the clip kept by the editor. */
function clipboardCommands(
  { diagram, selection, apply, t }: CommandInput,
  clip: UmlClip | null,
  setClip: (clip: UmlClip) => void,
  say: (message: string) => void,
) {
  const count = (s: UmlSelection) => s.elements.length + s.relations.length
  const copy = () => {
    const next = diagram ? copyItems(diagram, selection) : null
    if (!next) return false
    setClip(next)
    say(t.copied(selection.elements.length))
    return true
  }
  return {
    canCopy: Boolean(diagram && copyItems(diagram, selection)),
    canPaste: Boolean(diagram && clip?.diagram.kind === diagram.kind),
    copy,
    cut: () => {
      if (!diagram || !copy()) return
      apply(deleteItems(diagram, selection), t.deleted(selection.elements.length), NOTHING)
    },
    paste: () => {
      if (!diagram || !clip) return
      const near = selection.elements.find((id) => stepPath(id))
      const pasted = pasteItems(diagram, clip, near)
      apply(pasted.diagram, t.pasted(count(pasted.selection)), pasted.selection)
    },
    duplicate: () => {
      if (!diagram) return
      const copied = duplicateItems(diagram, selection)
      apply(copied.diagram, t.pasted(count(copied.selection)), copied.selection)
    },
  }
}

/** Arranging: positions dragged (kept for Undo), laid out again, turned another way. */
function layoutCommands({ diagram, selection, apply, t }: CommandInput) {
  return {
    /** The way the diagram flows; null for a sequence diagram, which has none. */
    direction: diagram && diagram.kind !== 'sequence' ? (diagram.direction ?? 'TB') : null,
    move: (layout: UmlLayout) => {
      if (!diagram || diagram.kind === 'sequence') return
      const next = Object.keys(layout).length ? { ...diagram, layout } : clearLayout(diagram)
      apply(next, t.moved, selection)
    },
    arrange: () => {
      if (diagram) apply(clearLayout(diagram), t.arranged, selection)
    },
    turn: (direction: UmlDirection) => {
      if (diagram) apply(setDirection(diagram, direction), t.arranged, selection)
    },
  }
}

export { clipboardCommands, editCommands, layoutCommands, relationCount, stepCommands }
