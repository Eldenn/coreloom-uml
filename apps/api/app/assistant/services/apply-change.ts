import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { isMermaidSpec, type UmlProblem } from '@coreloom-uml/uml'
import Architecture from '#app/architectures/models/architecture'
import {
  AssistantRole,
  ChangeOp,
  ChangeStatus,
  type StoredChange,
} from '#app/assistant/constants/assistant'
import AssistantMessage from '#app/assistant/models/assistant-message'
import { DiagramFormat } from '#app/diagrams/constants/diagram'
import Diagram from '#app/diagrams/models/diagram'
import { checkDiagramValue } from '#app/diagrams/services/diagram-content'
import { DIAGRAM_CHANGED, touchArchitecture } from '#app/diagrams/services/owned-diagram'

export const ApplyChangeAction = { Accept: 'accept', Reject: 'reject', Undo: 'undo' } as const
export type ApplyChangeAction = (typeof ApplyChangeAction)[keyof typeof ApplyChangeAction]

export const CHANGE_NOT_FOUND = { error: { message: 'Change not found' } } as const
/** Why a change action was refused, for the web to say in the user's language. */
export const ChangeConflictCode = {
  NotPending: 'not_pending',
  NotAccepted: 'not_accepted',
  EditedSince: 'edited_since',
  LastView: 'last_view',
  Stale: 'stale',
} as const
export type ChangeConflictCode = (typeof ChangeConflictCode)[keyof typeof ChangeConflictCode]

const NOT_PENDING = {
  message: 'This change is no longer pending.',
  code: ChangeConflictCode.NotPending,
} as const
const NOT_ACCEPTED = {
  message: 'Only an accepted change can be undone.',
  code: ChangeConflictCode.NotAccepted,
} as const
const EDITED_SINCE = {
  message: 'This view was changed after the change was applied: it can no longer be undone.',
  code: ChangeConflictCode.EditedSince,
} as const
const LAST_VIEW = {
  message: 'An architecture keeps at least one diagram.',
  code: ChangeConflictCode.LastView,
} as const
const STALE = { ...DIAGRAM_CHANGED, code: ChangeConflictCode.Stale } as const

export type ChangeOutcome =
  | { change: StoredChange; diagram: Diagram | null }
  /** Refused; `change` is stored as is (`stale` when the view moved on). */
  | { conflict: { message: string; code: ChangeConflictCode }; change: StoredChange }
  | { invalid: UmlProblem[] }
  | { notFound: true }

type Step = Exclude<ChangeOutcome, { notFound: true }> & { wrote?: boolean }

type Target = {
  architectureId: number
  conversationId: number
  messageId: number
  index: number
}

/**
 * Accepts, rejects or undoes one change an assistant message proposed: the only path from the
 * assistant to a diagram. Everything runs in one transaction with the architecture, the message
 * and the view locked, so concurrent calls on one architecture queue up and a change's status is
 * never lost. A view changed since the proposal (or since the accept, for an undo) is never
 * overwritten: the change turns `stale` and that status is kept.
 */
export function applyChange(action: ApplyChangeAction, target: Target): Promise<ChangeOutcome> {
  return db.transaction(async (trx) => {
    // Locked first, always: concurrent calls on one architecture wait here, in the same order.
    const architecture = await Architecture.query({ client: trx })
      .where('id', target.architectureId)
      .forUpdate()
      .firstOrFail()
    const message = await AssistantMessage.query({ client: trx })
      .where('id', target.messageId)
      .where('conversationId', target.conversationId)
      .where('role', AssistantRole.Assistant)
      .forUpdate()
      .first()
    const change = message?.changes?.[target.index]
    if (!message?.changes || !change) return { notFound: true }

    const step = await STEPS[action](change, architecture, trx)
    if ('invalid' in step) return step
    message.changes = message.changes.map((item, index) =>
      index === target.index ? step.change : item,
    )
    await message.save()
    if (step.wrote) await touchArchitecture(architecture)
    const { wrote: _wrote, ...outcome } = step
    return outcome
  })
}

type StepFn = (
  change: StoredChange,
  architecture: Architecture,
  trx: TransactionClientContract,
) => Promise<Step>

const STEPS: Record<ApplyChangeAction, StepFn> = {
  async accept(change, architecture, trx) {
    if (change.status !== ChangeStatus.Pending) return { conflict: NOT_PENDING, change }
    const accepted = { ...change, status: ChangeStatus.Accepted }

    if (change.op === ChangeOp.Create) {
      const checked = checkDiagramValue(change.after)
      if (!checked.diagram) return { invalid: checked.problems }
      const views = await viewsOf(architecture, trx)
      const format = isMermaidSpec(checked.diagram) ? DiagramFormat.Mermaid : DiagramFormat.Json
      const diagram = await Diagram.create(
        {
          architectureId: architecture.id,
          title: change.title,
          kind: checked.diagram.kind,
          content: checked.diagram,
          position: Math.max(-1, ...views.map((view) => view.position)) + 1,
          format,
          version: 1,
        },
        { client: trx },
      )
      return {
        change: { ...accepted, diagramId: diagram.id, format, appliedVersion: 1 },
        diagram,
        wrote: true,
      }
    }

    const diagram = await lockedView(architecture, change.diagramId, trx)
    if (
      !diagram ||
      diagram.version !== change.baseVersion ||
      diagram.title !== change.baseTitle ||
      diagram.format !== change.baseFormat
    ) {
      return stale(change)
    }

    if (change.op === ChangeOp.Delete) {
      if ((await viewsOf(architecture, trx)).length <= 1) return { conflict: LAST_VIEW, change }
      await diagram.delete()
      return { change: { ...accepted, position: diagram.position }, diagram: null, wrote: true }
    }

    const checked = checkDiagramValue(change.after)
    if (!checked.diagram) return { invalid: checked.problems }
    const baseKind = diagram.kind
    diagram.content = checked.diagram
    diagram.kind = checked.diagram.kind
    diagram.title = change.title || diagram.title
    diagram.version += 1
    await diagram.save()
    return {
      change: { ...accepted, appliedVersion: diagram.version, baseKind },
      diagram,
      wrote: true,
    }
  },

  async reject(change) {
    if (change.status !== ChangeStatus.Pending) return { conflict: NOT_PENDING, change }
    return { change: { ...change, status: ChangeStatus.Rejected }, diagram: null }
  },

  async undo(change, architecture, trx) {
    if (change.status !== ChangeStatus.Accepted) return { conflict: NOT_ACCEPTED, change }
    const undone = { ...change, status: ChangeStatus.Undone }

    if (change.op === ChangeOp.Delete) {
      const checked = change.before === null ? null : checkDiagramValue(change.before)
      if (checked && !checked.diagram) return { invalid: checked.problems }
      const kind = checked?.diagram?.kind ?? change.kind
      // Unreachable: only a failed change has no kind, and a failed change is never accepted.
      if (!kind) return { conflict: NOT_ACCEPTED, change }
      const position = change.position ?? 0
      await Diagram.query({ client: trx })
        .where('architectureId', architecture.id)
        .where('position', '>=', position)
        .increment('position', 1)
      const diagram = await Diagram.create(
        {
          architectureId: architecture.id,
          title: change.baseTitle ?? change.title,
          kind,
          content: checked?.diagram ?? null,
          position,
          format: change.format ?? DiagramFormat.Json,
          version: 1,
        },
        { client: trx },
      )
      return { change: { ...undone, diagramId: diagram.id }, diagram, wrote: true }
    }

    // The view must be exactly as the accept left it: same version, title and format. If not,
    // the change stays `accepted`: it is applied, only no longer undoable.
    const diagram = await lockedView(architecture, change.diagramId, trx)
    const title = change.op === ChangeOp.Create ? change.title : change.title || change.baseTitle
    const format = change.op === ChangeOp.Create ? change.format : change.baseFormat
    if (
      !diagram ||
      diagram.version !== change.appliedVersion ||
      diagram.title !== title ||
      diagram.format !== format
    ) {
      return { conflict: EDITED_SINCE, change }
    }

    if (change.op === ChangeOp.Create) {
      if ((await viewsOf(architecture, trx)).length <= 1) return { conflict: LAST_VIEW, change }
      await diagram.delete()
      return { change: undone, diagram: null, wrote: true }
    }

    const checked = change.before === null ? null : checkDiagramValue(change.before)
    if (checked && !checked.diagram) return { invalid: checked.problems }
    diagram.content = checked?.diagram ?? null
    diagram.kind = checked?.diagram?.kind ?? change.baseKind ?? diagram.kind
    diagram.title = change.baseTitle ?? diagram.title
    diagram.version += 1
    await diagram.save()
    return { change: undone, diagram, wrote: true }
  },
}

function stale(change: StoredChange): Step {
  return { conflict: STALE, change: { ...change, status: ChangeStatus.Stale } }
}

function viewsOf(architecture: Architecture, trx: TransactionClientContract) {
  return Diagram.query({ client: trx })
    .where('architectureId', architecture.id)
    .select('id', 'position')
}

function lockedView(
  architecture: Architecture,
  diagramId: number | null,
  trx: TransactionClientContract,
): Promise<Diagram | null> {
  if (diagramId === null) return Promise.resolve(null)
  return Diagram.query({ client: trx })
    .where('architectureId', architecture.id)
    .where('id', diagramId)
    .forUpdate()
    .first()
}
