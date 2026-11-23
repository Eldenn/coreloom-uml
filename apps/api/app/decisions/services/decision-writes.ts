import db from '@adonisjs/lucid/services/db'
import type { ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'
import {
  DECISION_LIMITS,
  type DecisionOption,
  DecisionStatus,
} from '#app/decisions/constants/decision'
import Decision from '#app/decisions/models/decision'
import Diagram from '#app/diagrams/models/diagram'
import type Project from '#app/projects/models/project'
import Requirement from '#app/requirements/models/requirement'
import { assertOwner } from '#app/shared/authorization/assert-owner'
import type User from '#app/users/models/user'

export const DECISION_NOT_FOUND = { error: { message: 'Decision not found' } } as const
export const DECISIONS_FULL = {
  error: { message: `A project holds at most ${DECISION_LIMITS.perProject} decisions.` },
} as const

type OptionInput = { name: string; pros?: string | null; cons?: string | null }

export type DecisionFields = {
  title: string
  context?: string | null
  options: OptionInput[]
  chosen?: string | null
  consequences?: string | null
  status?: DecisionStatus
  supersededById?: number | null
  requirementIds?: number[]
  diagramIds?: number[]
}

/** The body of a 422: the field that cannot be stored and why. */
export type DecisionRefusal = { error: { message: string; field: keyof DecisionFields } }
const refuse = (field: keyof DecisionFields, message: string): DecisionRefusal => ({
  error: { field, message },
})

/** The decision with its links if `user` owns it, else null: callers answer 404 either way. */
export async function findOwnedDecision(id: number, user: User): Promise<Decision | null> {
  const decision = await withLinks(Decision.query().where('id', id)).first()
  if (!decision || !assertOwner(decision, user)) return null
  return decision
}

/** Loads the ids of the requirements and diagrams a decision names, which its output lists. */
export function withLinks(query: ModelQueryBuilderContract<typeof Decision>) {
  return query
    .preload('requirements', (requirements) => requirements.select('id'))
    .preload('diagrams', (diagrams) => diagrams.select('id'))
}

/**
 * What keeps the decision as it would be stored from making sense, or null. `fields` are the
 * ones being written, `next` the decision once they are.
 */
async function problem(
  projectId: number,
  selfId: number | null,
  fields: Partial<DecisionFields>,
  next: Pick<Decision, 'options' | 'chosen' | 'status' | 'supersededById'>,
): Promise<DecisionRefusal | null> {
  const names = next.options.map((option) => option.name)
  if (new Set(names).size !== names.length)
    return refuse('options', 'Two options have the same name.')
  if (next.chosen !== null && !names.includes(next.chosen))
    return refuse('chosen', 'The chosen option is not one of the options.')
  if (next.status === DecisionStatus.Accepted && next.chosen === null)
    return refuse('chosen', 'An accepted decision names the option chosen.')

  if (next.supersededById !== null) {
    if (next.status !== DecisionStatus.Superseded)
      return refuse('supersededById', 'Only a superseded decision names the one that replaced it.')
    const other =
      next.supersededById === selfId
        ? null
        : await Decision.query().where({ id: next.supersededById, projectId }).first()
    if (!other) return refuse('supersededById', 'This is not another decision of the project.')
  }

  if (fields.requirementIds?.length) {
    const found = await Requirement.query()
      .where('projectId', projectId)
      .whereIn('id', fields.requirementIds)
      .count('* as total')
    if (Number(found[0].$extras.total) !== fields.requirementIds.length)
      return refuse('requirementIds', 'These are not all requirements of the project.')
  }
  if (fields.diagramIds?.length) {
    const found = await Diagram.query()
      .whereIn('id', fields.diagramIds)
      .whereIn('architectureId', (architectures) =>
        architectures.from('architectures').select('id').where('project_id', projectId),
      )
      .count('* as total')
    if (Number(found[0].$extras.total) !== fields.diagramIds.length)
      return refuse('diagramIds', 'These are not all diagrams of the project.')
  }
  return null
}

const cleanOptions = (options: OptionInput[]): DecisionOption[] =>
  options.map((option) => ({
    name: option.name,
    pros: option.pros || null,
    cons: option.cons || null,
  }))

/** Writes the fields given onto `decision`, without saving it. */
function assign(decision: Decision, fields: Partial<DecisionFields>) {
  if (fields.title !== undefined) decision.title = fields.title
  if (fields.context !== undefined) decision.context = fields.context || null
  if (fields.options !== undefined) decision.options = cleanOptions(fields.options)
  if (fields.chosen !== undefined) decision.chosen = fields.chosen
  if (fields.consequences !== undefined) decision.consequences = fields.consequences || null
  if (fields.status !== undefined) decision.status = fields.status
  if (fields.supersededById !== undefined) decision.supersededById = fields.supersededById
}

/** Saves `decision` and, when given, replaces the sets it is linked to; answers it with its links. */
async function save(decision: Decision, fields: Partial<DecisionFields>): Promise<Decision> {
  await db.transaction(async (client) => {
    decision.useTransaction(client)
    await decision.save()
    if (fields.requirementIds)
      await decision.related('requirements').sync(fields.requirementIds, true, client)
    if (fields.diagramIds) await decision.related('diagrams').sync(fields.diagramIds, true, client)
  })
  return withLinks(Decision.query().where('id', decision.id)).firstOrFail()
}

/**
 * Adds a decision to an owned project: `full` at the project's limit, a refusal when it does not
 * hold together (422), else the decision with its links.
 */
export async function createDecision(
  project: Project,
  fields: DecisionFields,
): Promise<Decision | 'full' | { refused: DecisionRefusal }> {
  const held = await Decision.query().where('projectId', project.id).count('* as total')
  if (Number(held[0].$extras.total) >= DECISION_LIMITS.perProject) return 'full'

  const decision = new Decision().fill({
    projectId: project.id,
    userId: project.userId,
    context: null,
    chosen: null,
    consequences: null,
    status: DecisionStatus.Proposed,
    supersededById: null,
  })
  assign(decision, fields)
  const refused = await problem(project.id, null, fields, decision)
  return refused ? { refused } : save(decision, fields)
}

/** Changes an owned decision; omitted fields are left as is. A refusal changes nothing. */
export async function updateDecision(
  decision: Decision,
  fields: Partial<DecisionFields>,
): Promise<Decision | { refused: DecisionRefusal }> {
  assign(decision, fields)
  const refused = await problem(decision.projectId, decision.id, fields, decision)
  return refused ? { refused } : save(decision, fields)
}
