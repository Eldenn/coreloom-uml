import { MARKER_PREFIX } from '@coreloom-uml/catalog'
import vine from '@vinejs/vine'
import type { FieldContext } from '@vinejs/vine/types'
import {
  AGENT_ANSWER_DETAILS_MAX_LENGTH,
  AGENT_ANSWERS_PER_REQUEST_MAX,
  AGENT_CONFIG_NAME_MAX_LENGTH,
  AGENT_IMPORT_MAX_LENGTH,
  AGENT_NOTES_MAX_LENGTH,
  AGENT_PROPOSAL_DIAGRAMS_MAX,
  AGENT_PROPOSAL_SOURCES,
  AGENT_RULE_SOURCES,
  AGENT_RULE_TEXT_MAX_LENGTH,
  TARGETS,
} from '#app/agent-configs/constants/agent-config'
import { llmCallFields } from '#app/llm/validators/llm-input'

/** Longest questionnaire, question or section name accepted on the wire. */
const CATALOG_ID_MAX_LENGTH = 64
/** Questionnaires one configuration can combine. */
const QUESTIONNAIRES_MAX = 10

/** No input may contain a managed-block marker: it could open or close a block in a file. */
const withoutMarkers = vine.createRule(
  (value: unknown, _options: undefined, field: FieldContext) => {
    if (typeof value === 'string' && value.includes(MARKER_PREFIX)) {
      field.report(
        `The {{ field }} field cannot contain "${MARKER_PREFIX}"`,
        'withoutMarkers',
        field,
      )
    }
  },
)

const catalogId = () => vine.string().trim().minLength(1).maxLength(CATALOG_ID_MAX_LENGTH)

const nameInput = () =>
  vine.string().trim().minLength(1).maxLength(AGENT_CONFIG_NAME_MAX_LENGTH).use(withoutMarkers())
const projectIdInput = () => vine.number().withoutDecimals().min(1)
const questionnairesInput = () =>
  vine.array(catalogId()).minLength(1).maxLength(QUESTIONNAIRES_MAX).distinct()
const targetsInput = () =>
  vine.array(vine.enum(TARGETS)).minLength(1).maxLength(TARGETS.length).distinct()
const notesInput = () =>
  vine.string().maxLength(AGENT_NOTES_MAX_LENGTH).use(withoutMarkers()).nullable()

/**
 * `POST /agent-configs`: in `projectId` (one of the caller's projects, which holds no
 * configuration yet), or outside any project when it is omitted or null.
 */
export const createAgentConfigInput = vine.create(
  vine.object({
    name: nameInput(),
    projectId: projectIdInput().nullable().optional(),
    questionnaires: questionnairesInput(),
    targets: targetsInput(),
    notes: notesInput().optional(),
  }),
)

/**
 * `PATCH /agent-configs/:id`: omitted fields are left as is; `projectId` moves it, null takes it
 * out of its project.
 */
export const updateAgentConfigInput = vine.create(
  vine.object({
    name: nameInput().optional(),
    projectId: projectIdInput().nullable().optional(),
    questionnaires: questionnairesInput().optional(),
    targets: targetsInput().optional(),
    notes: notesInput().optional(),
  }),
)

/** `GET /agent-configs` query params. */
export const listAgentConfigsInput = vine.create(
  vine.object({
    page: vine.number().withoutDecimals().min(1).optional(),
    perPage: vine.number().withoutDecimals().min(1).optional(),
    projectId: projectIdInput().optional(),
    search: vine.string().trim().maxLength(AGENT_CONFIG_NAME_MAX_LENGTH).optional(),
  }),
)

/**
 * `PUT /agent-configs/:id/answers`: a partial update. `value: null` removes the answer;
 * the value itself is checked against its question by the controller (`answerProblem`).
 */
export const updateAgentAnswersInput = vine.create(
  vine.object({
    answers: vine
      .array(
        vine.object({
          questionnaireId: catalogId(),
          questionId: catalogId(),
          value: vine.any().nullable(),
          /** Omitted: left as is. */
          details: vine
            .string()
            .maxLength(AGENT_ANSWER_DETAILS_MAX_LENGTH)
            .use(withoutMarkers())
            .nullable()
            .optional(),
        }),
      )
      .minLength(1)
      .maxLength(AGENT_ANSWERS_PER_REQUEST_MAX),
  }),
)

const ruleText = () =>
  vine.string().trim().minLength(1).maxLength(AGENT_RULE_TEXT_MAX_LENGTH).use(withoutMarkers())

/** `POST /agent-configs/:id/rules` */
export const createAgentRuleInput = vine.create(
  vine.object({
    section: catalogId(),
    text: ruleText(),
    source: vine.enum(AGENT_RULE_SOURCES).optional(),
  }),
)

/** `PATCH /agent-configs/:id/rules/:ruleId`: omitted fields are left as is. */
export const updateAgentRuleInput = vine.create(
  vine.object({
    section: catalogId().optional(),
    text: ruleText().optional(),
    /** The rule's new place among the configuration's rules, from 0 (clamped to the end). */
    position: vine.number().withoutDecimals().min(0).optional(),
  }),
)

/**
 * `POST /agent-configs/:id/proposals`: the user's provider, and what the model reads —
 * the answers' notes (default), or its diagrams (all of them when `diagramIds` is
 * omitted, in the given order otherwise).
 */
export const agentProposalsInput = vine.create(
  vine.object({
    ...llmCallFields(),
    from: vine.enum(AGENT_PROPOSAL_SOURCES).optional(),
    diagramIds: vine
      .array(vine.number().withoutDecimals().min(1))
      .minLength(1)
      .maxLength(AGENT_PROPOSAL_DIAGRAMS_MAX)
      .distinct()
      .optional(),
  }),
)

/**
 * `POST /agent-configs/:id/imports`: the user's provider and the file to read. The file
 * may hold a managed block (its markers included): it is left out before the model reads it.
 */
export const agentImportInput = vine.create(
  vine.object({
    ...llmCallFields(),
    content: vine.string().trim().minLength(1).maxLength(AGENT_IMPORT_MAX_LENGTH),
  }),
)

/** `GET /agent-configs/:id/generations` query params. */
export const listAgentGenerationsInput = vine.create(
  vine.object({
    page: vine.number().withoutDecimals().min(1).optional(),
    perPage: vine.number().withoutDecimals().min(1).optional(),
  }),
)
