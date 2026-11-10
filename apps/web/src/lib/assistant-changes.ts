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

/** The part of the editor's autosave a change action needs (`useDiagramAutosave`). */
export interface AutosaveControl {
  flushDiagram(diagramId: number): Promise<boolean>
  reset(diagramId: number): void
}

/**
 * Runs a change action without losing or overwriting the editor's text: an accept or an undo
 * first saves what the user typed in that view (and stops, returning `null`, if that save fails),
 * then makes the editor read the server's copy again.
 */
export async function applyChange<T>(
  autosave: AutosaveControl,
  action: ChangeAction,
  change: { diagramId: number | null },
  run: () => Promise<T>,
): Promise<T | null> {
  const diagramId = action === 'reject' ? null : change.diagramId
  if (diagramId === null) return run()
  if (!(await autosave.flushDiagram(diagramId))) return null
  const result = await run()
  autosave.reset(diagramId)
  return result
}
