// Autosave for the diagrams of one architecture: keeps each view's text while it's edited, and
// saves the diagram it reads (UML JSON) a moment after the last change, with the version it was
// based on so a save from another tab is never overwritten silently (RM-16).
import { isPlantUml, type UmlParseResult, type UmlSpec } from '@coreloom-uml/uml'
import { useQueryClient } from '@tanstack/react-query'
import * as React from 'react'

import {
  canWrite,
  DIAGRAM_TEMPLATES,
  type DiagramFormat,
  writeDiagram,
} from '@/components/diagram-editor'
import type { SaveState } from '@/components/ui/save-status'
import {
  type ArchitectureDetail,
  architectureKeys,
  type Diagram,
  useSaveDiagram,
} from '@/lib/architectures'
import { TuyauError } from '@/lib/client'

/** Quiet time after the last change before the changes are saved. */
const AUTOSAVE_DELAY_MS = 1200

interface Draft {
  value: string
  format: DiagramFormat
}

interface Pending {
  content: UmlSpec
  format: DiagramFormat
}

/** The text a diagram opens with: its saved content, or the template for its kind. */
function initialDraft(diagram: Diagram): Draft {
  if (diagram.content) {
    const spec = diagram.content as unknown as UmlSpec
    const format: DiagramFormat = canWrite(spec.kind, diagram.format) ? diagram.format : 'json'
    return { value: writeDiagram(spec, format), format }
  }
  const template = DIAGRAM_TEMPLATES.find((tpl) => tpl.kind === diagram.kind)?.text ?? ''
  return { value: template, format: isPlantUml(template) ? 'plantuml' : 'mermaid' }
}

function isConflict(error: unknown) {
  return error instanceof TuyauError && error.status === 409
}

export function useDiagramAutosave(architecture: ArchitectureDetail) {
  const save = useSaveDiagram(architecture.id)
  const [drafts, setDrafts] = React.useState<Record<number, Draft>>({})
  const [state, setState] = React.useState<SaveState>('saved')
  const [savedAt, setSavedAt] = React.useState<Date>()
  const [conflictId, setConflictId] = React.useState<number | null>(null)
  const pending = React.useRef(new Map<number, Pending>())
  const queryClient = useQueryClient()
  const architectureId = architecture.id

  const draftOf = (diagram: Diagram) => drafts[diagram.id] ?? initialDraft(diagram)

  const flush = React.useCallback(
    async (force = false) => {
      setState('saving')
      for (const [diagramId, change] of [...pending.current]) {
        // The cached copy: its `version` moves with every save.
        const current = queryClient
          .getQueryData<ArchitectureDetail>(architectureKeys.detail(architectureId))
          ?.diagrams.find((d) => d.id === diagramId)
        if (!current) {
          pending.current.delete(diagramId)
          continue
        }
        try {
          await save.mutateAsync({
            diagramId,
            content: change.content as unknown as NonNullable<Diagram['content']>,
            format: change.format,
            version: current.version,
            force,
          })
          if (pending.current.get(diagramId) === change) pending.current.delete(diagramId)
        } catch (error) {
          if (isConflict(error)) setConflictId(diagramId)
          setState('error')
          return
        }
      }
      setConflictId(null)
      setSavedAt(new Date())
      setState(pending.current.size ? 'unsaved' : 'saved')
    },
    [save, queryClient, architectureId],
  )

  React.useEffect(() => {
    if (state !== 'unsaved') return
    const timer = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [state, drafts, flush])

  const onDiagramChange = (
    diagram: Diagram,
    value: string,
    result: UmlParseResult,
    format: DiagramFormat,
  ) => {
    setDrafts((all) => ({ ...all, [diagram.id]: { value, format } }))
    // Text that can't be read yet stays a draft; the last good diagram stays saved.
    if (!result.diagram || result.problems.some((p) => p.severity === 'error')) return
    const unchanged =
      JSON.stringify(result.diagram) === JSON.stringify(diagram.content) &&
      format === diagram.format
    if (unchanged) return
    pending.current.set(diagram.id, { content: result.diagram, format })
    if (conflictId === null) setState('unsaved')
  }

  /** Drops the local edits of a diagram, to show the copy saved elsewhere. */
  const discard = (diagramId: number) => {
    pending.current.delete(diagramId)
    setDrafts(({ [diagramId]: _dropped, ...rest }) => rest)
    setConflictId(null)
    setState(pending.current.size ? 'unsaved' : 'saved')
  }

  return {
    draftOf,
    onDiagramChange,
    state,
    savedAt,
    conflictId,
    retry: () => void flush(),
    overwrite: () => void flush(true),
    discard,
  }
}
