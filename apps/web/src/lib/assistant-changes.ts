// Pure helpers of the workspace assistant, kept free of the API client so they run in Node tests.

/** Estimated input tokens of the next message, as `POST …/context` and `…/messages` return it. */
export interface ContextBudget {
  system: number
  diagrams: number
  history: number
  max: number
  skipped: number[]
}

/** Past this share of the maximum the panel warns that the conversation is filling up. */
const ASSISTANT_WARN_RATIO = 0.8

export type BudgetLevel = 'ok' | 'warn' | 'full'

export function budgetLevel(budget: ContextBudget): BudgetLevel {
  const used = budget.system + budget.diagrams + budget.history
  if (used > budget.max) return 'full'
  return used >= ASSISTANT_WARN_RATIO * budget.max ? 'warn' : 'ok'
}

export type ChangeAction = 'accept' | 'reject' | 'undo'

/**
 * A view's edits after `flushDiagram`: saved (or none), a save that failed, or text that does not
 * read as a diagram and so was never saved.
 */
export type FlushResult = 'saved' | 'failed' | 'unreadable'

/** The part of the editor's autosave a change action needs (`useDiagramAutosave`). */
export interface AutosaveControl {
  flushDiagram(diagramId: number): Promise<FlushResult>
  reset(diagramId: number): void
  /** Runs `task` with every save held back until it settles. */
  exclusive<T>(task: () => Promise<T>): Promise<T>
}

/**
 * Runs a change action without losing or overwriting the editor's text: an accept or an undo
 * first saves what the user typed in that view (and stops, with the reason, if that save fails or
 * the text does not read as a diagram), then makes the editor read the server's copy again. Saves
 * wait until that reset: text typed in the view while the action runs is dropped, never sent
 * against the version the action wrote.
 */
export async function applyChange<T>(
  autosave: AutosaveControl,
  action: ChangeAction,
  change: { diagramId: number | null },
  run: () => Promise<T>,
): Promise<{ done: T } | { refused: Exclude<FlushResult, 'saved'> }> {
  const diagramId = action === 'reject' ? null : change.diagramId
  if (diagramId === null) return { done: await run() }
  const flushed = await autosave.flushDiagram(diagramId)
  if (flushed !== 'saved') return { refused: flushed }
  return autosave.exclusive(async () => {
    const result = await run()
    autosave.reset(diagramId)
    return { done: result }
  })
}
