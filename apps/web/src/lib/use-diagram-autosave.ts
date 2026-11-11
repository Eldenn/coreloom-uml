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
import type { FlushResult } from '@/lib/assistant-changes'
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
    const spec = diagram.content
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
  /** Views whose text does not read as a diagram: kept as a draft, never saved. */
  const unreadable = React.useRef(new Set<number>())
  const queryClient = useQueryClient()
  const architectureId = architecture.id

  const draftOf = (diagram: Diagram) => drafts[diagram.id] ?? initialDraft(diagram)

  // Saves run one at a time, so a view's flush waits for a save already on its way.
  const queue = React.useRef<Promise<unknown>>(Promise.resolve())
  const enqueue = React.useCallback(<T>(task: () => Promise<T>) => {
    const run = queue.current.then(task)
    // A task that fails must not stop the saves queued after it.
    queue.current = run.catch(() => undefined)
    return run
  }, [])
  // Mirrors `conflictId` for calls made from an older render (an awaited assistant change).
  const conflict = React.useRef<number | null>(null)
  const markConflict = React.useCallback((diagramId: number | null) => {
    conflict.current = diagramId
    setConflictId(diagramId)
  }, [])

  /** Saves one view's pending change; a change dropped meanwhile (`reset`) is never sent. */
  const saveChange = React.useCallback(
    async (diagramId: number, change: Pending, force: boolean) => {
      if (pending.current.get(diagramId) !== change) return
      // The cached copy: its `version` moves with every save.
      const current = queryClient
        .getQueryData<ArchitectureDetail>(architectureKeys.detail(architectureId))
        ?.diagrams.find((d) => d.id === diagramId)
      if (!current) {
        pending.current.delete(diagramId)
        return
      }
      await save.mutateAsync({
        diagramId,
        content: change.content,
        format: change.format,
        version: current.version,
        force,
      })
      if (pending.current.get(diagramId) === change) pending.current.delete(diagramId)
    },
    [save, queryClient, architectureId],
  )

  const saved = React.useCallback(() => {
    setSavedAt(new Date())
    setState(pending.current.size ? 'unsaved' : 'saved')
  }, [])

  const flush = React.useCallback(
    (force = false) =>
      enqueue(async () => {
        setState('saving')
        for (const [diagramId, change] of [...pending.current]) {
          try {
            await saveChange(diagramId, change, force)
          } catch (error) {
            if (isConflict(error)) markConflict(diagramId)
            setState('error')
            return
          }
        }
        markConflict(null)
        saved()
      }),
    [enqueue, saveChange, markConflict, saved],
  )

  /**
   * Saves only this view's pending change: `failed` when that save failed or met a conflict,
   * `unreadable` (nothing saved) when the view's text does not read as a diagram.
   */
  const flushDiagram = (diagramId: number) =>
    enqueue(async (): Promise<FlushResult> => {
      if (unreadable.current.has(diagramId)) return 'unreadable'
      const change = pending.current.get(diagramId)
      if (!change) return 'saved'
      try {
        await saveChange(diagramId, change, false)
      } catch (error) {
        if (isConflict(error)) markConflict(diagramId)
        setState('error')
        return 'failed'
      }
      // Another view's conflict stays on screen until it is settled.
      if (conflict.current === null || conflict.current === diagramId) {
        markConflict(null)
        saved()
      }
      return 'saved'
    })

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
    if (!result.diagram || result.problems.some((p) => p.severity === 'error')) {
      unreadable.current.add(diagram.id)
      return
    }
    unreadable.current.delete(diagram.id)
    const unchanged =
      JSON.stringify(result.diagram) === JSON.stringify(diagram.content) &&
      format === diagram.format
    if (unchanged) return
    pending.current.set(diagram.id, { content: result.diagram, format })
    if (conflict.current === null) setState('unsaved')
  }

  /**
   * Drops the local edits of a diagram, to show the copy saved elsewhere; other views keep theirs,
   * and their conflict if they have one.
   */
  const discard = (diagramId: number) => {
    pending.current.delete(diagramId)
    unreadable.current.delete(diagramId)
    setDrafts(({ [diagramId]: _dropped, ...rest }) => rest)
    if (conflict.current !== null && conflict.current !== diagramId) return
    markConflict(null)
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
    flushDiagram,
    /** Runs `task` with every save held back until it settles. */
    exclusive: enqueue,
    /** After an assistant change: the editor reads the server's copy of that view again. */
    reset: discard,
  }
}
