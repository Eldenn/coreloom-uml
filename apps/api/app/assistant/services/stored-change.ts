import type { ProposedChange } from '@coreloom-uml/llm'
import { keepLayout, type UmlProblem, type UmlSpec } from '@coreloom-uml/uml'
import { ChangeOp, ChangeStatus, type StoredChange } from '#app/assistant/constants/assistant'
import {
  DIAGRAM_KINDS,
  DIAGRAM_TITLE_MAX_LENGTH,
  type DiagramKind,
} from '#app/diagrams/constants/diagram'
import type Diagram from '#app/diagrams/models/diagram'
import { checkDiagramValue } from '#app/diagrams/services/diagram-content'

const knownKind = (kind: string | undefined): DiagramKind | null =>
  DIAGRAM_KINDS.find((known) => known === kind) ?? null

const problem = (text: string): UmlProblem => ({ line: 0, severity: 'error', code: 'schema', text })

/**
 * A proposed change as stored: an update or a delete keeps the view as it is now (`before`, the
 * base fields the accept checks for staleness), an update keeps the old positions of the elements
 * that stay. A diagram a save would refuse, or a create without a title, is stored as `failed`.
 */
export function storedChange(change: ProposedChange, diagrams: readonly Diagram[]): StoredChange {
  const target =
    'diagramId' in change ? diagrams.find((diagram) => diagram.id === change.diagramId) : undefined
  const proposed = 'title' in change ? change.title : undefined
  const title = (proposed ?? target?.title ?? '').trim().slice(0, DIAGRAM_TITLE_MAX_LENGTH)
  const base = {
    op: change.op,
    diagramId: target?.id ?? null,
    kind: target?.kind ?? ('kind' in change ? knownKind(change.kind) : null),
    title,
    format: target?.format ?? null,
    before: target?.content ?? null,
    after: null as UmlSpec | null,
    baseVersion: target?.version ?? null,
    baseTitle: target?.title ?? null,
    baseFormat: target?.format ?? null,
    relayout: false,
    placed: 0,
    status: ChangeStatus.Pending as ChangeStatus,
    appliedVersion: null,
    problems: [] as UmlProblem[],
  }
  if ('failed' in change) return { ...base, status: ChangeStatus.Failed, problems: change.failed }
  if (change.op === ChangeOp.Delete) return base

  const problems: UmlProblem[] = []
  if (!title) problems.push(problem('A view needs a title'))
  const { diagram, placed } = keepLayout(base.before, change.after, change.relayout)
  const checked = checkDiagramValue(diagram)
  problems.push(...(checked.diagram ? [] : checked.problems))
  if (problems.length) return { ...base, status: ChangeStatus.Failed, problems }
  return { ...base, kind: diagram.kind, after: checked.diagram, relayout: change.relayout, placed }
}
