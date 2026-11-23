import { AssistantToolKind } from '@coreloom-uml/llm'
import { z } from 'zod'
import {
  type ActionApplied,
  type AssistantAction,
  idInput,
  NOT_FOUND_SENTENCE,
  readAction,
  TARGET_NOT_FOUND,
  writeAction,
} from '#app/assistant/actions/action'
import {
  ActionFailure,
  AssistantTargetKind,
  POINTED_LABEL_MAX_LENGTH,
  POINTED_TYPES,
} from '#app/assistant/constants/assistant'
import { DECISION_LIMITS, DecisionStatus } from '#app/decisions/constants/decision'
import Decision from '#app/decisions/models/decision'
import { serializeParts } from '#app/decisions/serializers/decision-serializer'
import {
  createDecision,
  creationProblem,
  DECISIONS_FULL,
  findOwnedDecision,
  updateDecision,
  withLinks,
} from '#app/decisions/services/decision-writes'
import { projectDesignFindings } from '#app/decisions/services/design-review'
import { findOwnedProject } from '#app/projects/services/owned-project'
import {
  REQUIREMENT_CATEGORIES,
  REQUIREMENT_LIMITS,
  REQUIREMENT_PRIORITIES,
} from '#app/requirements/constants/requirement'
import Requirement from '#app/requirements/models/requirement'
import { designRecordsEnabled } from '#app/requirements/services/design-records-flag'
import {
  createRequirement,
  REQUIREMENTS_FULL,
  requirementsFull,
} from '#app/requirements/services/requirement-writes'
import type User from '#app/users/models/user'

/*
 * A project's requirements and decisions (`app/requirements/`, `app/decisions/`), offered only
 * while their routes answer. The model proposes; the owner's accept writes through the routes'
 * services. Editing and deleting stay on the project's Design tab.
 */

const available = (user: User) => designRecordsEnabled(user)

const text = (max: number) => z.string().trim().max(max)
const ids = () => z.array(idInput()).max(DECISION_LIMITS.links)

/** As `createDecisionInput`, without `superseded`: a decision is replaced by `supersede_decision`. */
const decisionFields = {
  title: text(DECISION_LIMITS.titleLength).min(1).describe('The question decided'),
  context: text(DECISION_LIMITS.textLength).optional().describe('Why the question comes up'),
  options: z
    .array(
      z.object({
        name: text(DECISION_LIMITS.optionNameLength).min(1),
        pros: text(DECISION_LIMITS.optionTextLength).optional(),
        cons: text(DECISION_LIMITS.optionTextLength).optional(),
      }),
    )
    .min(1)
    .max(DECISION_LIMITS.options)
    .describe('The options weighed, each named once'),
  chosen: text(DECISION_LIMITS.optionNameLength)
    .min(1)
    .optional()
    .describe('The name of the option chosen; required when accepted'),
  consequences: text(DECISION_LIMITS.textLength)
    .optional()
    .describe('What the choice costs or makes necessary'),
  status: z
    .enum([DecisionStatus.Proposed, DecisionStatus.Accepted])
    .optional()
    .describe('accepted only when the owner said the choice is made; proposed otherwise'),
  requirementIds: ids().optional().describe('Requirements of the project it serves'),
  diagramIds: ids().optional().describe('Views (diagrams) of the project it shapes'),
  parts: z
    .array(
      z.object({
        diagramId: idInput(),
        type: z.enum(POINTED_TYPES),
        label: text(POINTED_LABEL_MAX_LENGTH).min(1),
      }),
    )
    .max(DECISION_LIMITS.parts)
    .optional()
    .describe(
      'Parts of those views it is about, each by its view and the one line that names it there, as pointed parts are named: `Payment`, `Payment.total: number`, `Order → Payment: pays`, `Client -> API: login()`',
    ),
}
const decisionInput = z.object({ projectId: idInput(), ...decisionFields })
const supersedeInput = z.object({ decisionId: idInput(), ...decisionFields })

const sentence = (problem: Awaited<ReturnType<typeof creationProblem>>): string | null =>
  problem === 'full' ? DECISIONS_FULL.error.message : (problem?.error.message ?? null)

/** What `createDecision` answered, as an action's failure, or the decision. */
function created(result: Awaited<ReturnType<typeof createDecision>>): Decision | ActionApplied {
  if (result === 'full')
    return { failure: ActionFailure.Conflict, message: DECISIONS_FULL.error.message }
  if ('refused' in result)
    return { failure: ActionFailure.Invalid, message: result.refused.error.message }
  return result
}

export const DESIGN_ACTIONS: readonly AssistantAction[] = [
  readAction({
    name: 'read_project_design',
    description:
      "Reads the requirements of one of the owner's projects (id, category, must or should, the sentence, its measure) and its decisions (id, question, status, the options' names, the one chosen, the decision that replaced it, the ids of the requirements and views it names, the parts of views it names). Read it before proposing a requirement or a decision, so none is proposed twice.",
    input: z.object({ projectId: idInput() }),
    kind: AssistantToolKind.Read,
    available,
    async read({ projectId }, user) {
      const project = await findOwnedProject(projectId, user)
      if (!project) return { error: NOT_FOUND_SENTENCE }
      // A project holds at most `perProject` of each: both lists are whole.
      const [requirements, decisions] = await Promise.all([
        Requirement.query()
          .where('projectId', project.id)
          .orderBy('priority', 'asc')
          .orderBy('id', 'asc'),
        withLinks(Decision.query().where('projectId', project.id)).orderBy('id', 'asc'),
      ])
      return {
        requirements: requirements.map(({ id, category, priority, statement, measure }) => ({
          id,
          category,
          priority,
          statement,
          measure,
        })),
        decisions: decisions.map((decision) => ({
          id: decision.id,
          title: decision.title,
          status: decision.status,
          options: decision.options.map((option) => option.name),
          chosen: decision.chosen,
          supersededById: decision.supersededById,
          requirementIds: decision.requirements.map((requirement) => requirement.id),
          diagramIds: decision.diagrams.map((diagram) => diagram.id),
          parts: serializeParts(decision),
        })),
      }
    },
  }),
  readAction({
    name: 'read_design_review',
    description:
      "Reads what the requirements and decisions of one of the owner's projects say against themselves: a requirement that must hold and that no accepted decision serves, an accepted decision that names no view, a superseded decision still named on views, a decision still standing that names a part its view no longer has. Each finding names the requirement or the decision it is about.",
    input: z.object({ projectId: idInput() }),
    kind: AssistantToolKind.Read,
    available,
    async read({ projectId }, user) {
      const project = await findOwnedProject(projectId, user)
      if (!project) return { error: NOT_FOUND_SENTENCE }
      return { findings: await projectDesignFindings(project.id) }
    },
  }),
  readAction({
    name: 'read_decision',
    description:
      "Reads one of the owner's decisions in full: its context, each option with what speaks for and against it, the one chosen and the consequences.",
    input: z.object({ decisionId: idInput() }),
    kind: AssistantToolKind.Read,
    available,
    async read({ decisionId }, user) {
      const decision = await findOwnedDecision(decisionId, user)
      if (!decision) return { error: NOT_FOUND_SENTENCE }
      const { id, projectId, title, context, options, chosen, consequences, status } = decision
      return { id, projectId, title, context, options, chosen, consequences, status }
    },
  }),
  writeAction({
    name: 'add_requirement',
    description:
      "Proposes to add a requirement to one of the owner's projects: one sentence someone can check (a quality the architecture has to reach or a constraint it has to keep), with the measure that says it is met when there is a number.",
    input: z.object({
      projectId: idInput(),
      category: z.enum(REQUIREMENT_CATEGORIES),
      priority: z.enum(REQUIREMENT_PRIORITIES),
      statement: text(REQUIREMENT_LIMITS.statementLength).min(1),
      measure: text(REQUIREMENT_LIMITS.measureLength).optional(),
    }),
    kind: AssistantToolKind.Write,
    available,
    async subject({ projectId }, user) {
      return (await findOwnedProject(projectId, user))?.name ?? TARGET_NOT_FOUND
    },
    async currentProblem({ projectId }) {
      return (await requirementsFull(projectId)) ? REQUIREMENTS_FULL.error.message : null
    },
    async apply({ projectId, ...fields }, user, client) {
      const project = await findOwnedProject(projectId, user)
      if (!project) return { failure: ActionFailure.NotFound }
      const requirement = await createRequirement(project, fields, client)
      if (requirement === 'full')
        return { failure: ActionFailure.Conflict, message: REQUIREMENTS_FULL.error.message }
      return { kind: AssistantTargetKind.Project, id: project.id }
    },
  }),
  writeAction({
    name: 'add_decision',
    description:
      "Proposes to record an architecture decision in one of the owner's projects: the question, the options weighed with what speaks for and against each, the one chosen and what it costs. To replace a decision that no longer holds, use supersede_decision instead.",
    input: decisionInput,
    kind: AssistantToolKind.Write,
    available,
    async subject({ projectId }, user) {
      return (await findOwnedProject(projectId, user))?.name ?? TARGET_NOT_FOUND
    },
    async currentProblem({ projectId, ...fields }, user) {
      const project = await findOwnedProject(projectId, user)
      return project ? sentence(await creationProblem(project, fields)) : null
    },
    async apply({ projectId, ...fields }, user, client) {
      const project = await findOwnedProject(projectId, user)
      if (!project) return { failure: ActionFailure.NotFound }
      const decision = created(await createDecision(project, fields, client))
      return decision instanceof Decision
        ? { kind: AssistantTargetKind.Project, id: project.id }
        : decision
    },
  }),
  writeAction({
    name: 'supersede_decision',
    description:
      "Proposes to replace one of the owner's decisions by a new one: the new decision is recorded in the same project and the old one stays, marked as superseded by it. Use it when a choice already recorded no longer holds, never to correct a typo.",
    input: supersedeInput,
    kind: AssistantToolKind.Write,
    available,
    async subject({ decisionId }, user) {
      return (await findOwnedDecision(decisionId, user))?.title ?? TARGET_NOT_FOUND
    },
    async currentProblem({ decisionId, ...fields }, user) {
      const replaced = await findOwnedDecision(decisionId, user)
      const project = replaced && (await findOwnedProject(replaced.projectId, user))
      if (!project) return null
      if (replaced.status === DecisionStatus.Superseded)
        return 'This decision is already superseded.'
      return sentence(await creationProblem(project, fields))
    },
    // The card goes stale when the decision is accepted, reopened or replaced meanwhile.
    async before({ decisionId }, user) {
      return (await findOwnedDecision(decisionId, user))?.status ?? null
    },
    async apply({ decisionId, ...fields }, user, client) {
      const replaced = await findOwnedDecision(decisionId, user)
      const project = replaced && (await findOwnedProject(replaced.projectId, user))
      if (!project) return { failure: ActionFailure.NotFound }
      const decision = created(await createDecision(project, fields, client))
      if (!(decision instanceof Decision)) return decision
      const superseded = await updateDecision(
        replaced,
        { status: DecisionStatus.Superseded, supersededById: decision.id },
        client,
      )
      if ('refused' in superseded)
        return { failure: ActionFailure.Invalid, message: superseded.refused.error.message }
      return { kind: AssistantTargetKind.Project, id: project.id }
    },
  }),
]
