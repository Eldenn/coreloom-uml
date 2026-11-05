import * as React from 'react'

import { DiagramProperties } from '@/components/diagram-properties'
import { SequenceOutline } from '@/components/diagram-sequence'
import { DiagramTools } from '@/components/diagram-tools'
import { UmlDiagram, type UmlDiagramHandle } from '@/components/ui/uml-diagram'
import type { useDiagramEditing } from '@/components/use-diagram-editing'
import { useCoreloomI18n } from '@/lib/i18n'
import type { UmlDirection, UmlLayout, UmlSpec } from '@/lib/uml'
import { elementTypes, type UmlElementType } from '@/lib/uml-edit'

type Editing = ReturnType<typeof useDiagramEditing>

const SHORTCUTS: Partial<Record<string, (editing: Editing, shift: boolean) => void>> = {
  z: (e, shift) => {
    if (shift) e.redo()
    else e.undo()
  },
  y: (e) => {
    e.redo()
  },
  c: (e) => {
    e.copy()
  },
  x: (e) => {
    e.cut()
  },
  v: (e) => {
    e.paste()
  },
  d: (e) => {
    e.duplicate()
  },
}

/** Ctrl or ⌘ shortcuts on the drawing, for the tools that are also in the toolbar. */
function shortcutKeys(editing: Editing, locked: boolean) {
  return (event: React.KeyboardEvent) => {
    const target = event.target as HTMLElement
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return
    const key = event.key.toLowerCase()
    const run = SHORTCUTS[key]
    if (!run || (locked && key !== 'z' && key !== 'y')) return
    event.preventDefault()
    run(editing, event.shiftKey)
  }
}

function SidePanel({
  diagram,
  locked,
  editing,
}: {
  diagram: UmlSpec
  locked: boolean
  editing: Editing
}) {
  const t = useCoreloomI18n().messages.diagramTools
  const properties = (
    <DiagramProperties
      diagram={diagram}
      selection={editing.selection}
      locked={locked}
      onElementChange={editing.changeElement}
      onRelationChange={editing.changeRelation}
      onReverse={editing.reverse}
      steps={{
        onChange: editing.changeStep,
        onMove: editing.moveStep,
        onAddSection: editing.addSection,
        onRemoveSection: editing.removeSection,
      }}
      nameRef={editing.nameRef}
      className="p-0"
    />
  )
  return (
    <div className="flex max-h-[420px] min-h-0 flex-col gap-4 overflow-auto border-t border-border p-3 *:shrink-0 lg:max-h-none lg:w-64 lg:shrink-0 lg:border-t-0 lg:border-l">
      {diagram.kind === 'sequence' && (
        <SequenceOutline
          diagram={diagram}
          selected={editing.selection.elements}
          onSelect={(elements) => {
            editing.select({ elements, relations: [] })
          }}
          buttons={editing.stepButtons}
          t={t}
        />
      )}
      {properties}
    </div>
  )
}

function Drawing({
  diagram,
  label,
  locked: problems,
  readOnly,
  editing,
  directions,
  notes = true,
  imageRef,
  onLayoutChange,
}: {
  diagram: UmlSpec | null
  label: string
  /** The text has problems: the tools would lose what couldn't be read. */
  locked: boolean
  /** Nothing may change: no tools, no properties, no dragging. */
  readOnly: boolean
  editing: Editing
  /** Positions dragged while the text has problems: kept, but not written to the text. */
  onLayoutChange: (layout: UmlLayout) => void
  /** The directions the text's format can keep. */
  directions: readonly UmlDirection[]
  /** The text's format keeps notes (a Mermaid flowchart has none). Default: true. */
  notes?: boolean
  imageRef: React.Ref<UmlDiagramHandle>
}) {
  const empty = useCoreloomI18n().messages.diagram.empty
  const locked = problems || readOnly
  const pane = React.useRef<HTMLDivElement>(null)
  const remove = () => {
    editing.remove()
    // The Delete button is about to be disabled: keep focus on the drawing.
    requestAnimationFrame(() => {
      pane.current?.querySelector<HTMLElement>('[role="application"], [role="region"]')?.focus()
    })
  }
  const types = (diagram ? elementTypes(diagram) : []).filter((type) => notes || type !== 'note')
  const drop = (type: string, at: { x: number; y: number }) => {
    const known = types.find((x): x is UmlElementType => x === type)
    if (known) editing.add(known, at)
  }
  const editable = locked
    ? {}
    : {
        onConnect: editing.connectDragged,
        onDelete: editing.remove,
        onRename: editing.rename,
        onElementDrop: drop,
      }
  return (
    // The keys are shortcuts for tools in the toolbar, which stay the way to reach them.

    <div
      ref={pane}
      className="flex min-h-0 min-w-0 flex-col"
      {...(readOnly ? {} : { onKeyDown: shortcutKeys(editing, locked) })}
    >
      <DiagramTools
        diagram={diagram}
        locked={problems}
        readOnly={readOnly}
        selected={editing.selection.elements}
        canDelete={editing.canDelete}
        canCopy={editing.canCopy}
        canPaste={editing.canPaste}
        canUndo={editing.canUndo}
        canRedo={editing.canRedo}
        direction={editing.direction}
        directions={directions}
        types={types}
        onAdd={editing.add}
        onConnect={editing.connect}
        onDelete={remove}
        onCopy={editing.copy}
        onPaste={editing.paste}
        onDuplicate={editing.duplicate}
        onArrange={editing.arrange}
        onDirection={editing.turn}
        onUndo={editing.undo}
        onRedo={editing.redo}
      />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="h-[340px] min-h-0 min-w-0 p-3 lg:h-auto lg:flex-1">
          {diagram ? (
            <UmlDiagram
              ref={imageRef}
              diagram={diagram}
              editable={!readOnly}
              onLayoutChange={problems ? onLayoutChange : editing.move}
              selection={editing.selection}
              onSelectionChange={editing.select}
              {...editable}
              height="100%"
              label={label}
              className="h-full"
            />
          ) : (
            <p className="grid h-full place-items-center rounded-lg border border-dashed border-border text-[13px] text-muted-foreground">
              {empty}
            </p>
          )}
        </div>
        {diagram && <SidePanel diagram={diagram} locked={locked} editing={editing} />}
      </div>
    </div>
  )
}

export { Drawing }
