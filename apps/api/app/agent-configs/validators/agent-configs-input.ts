import {
  MARKER_PREFIX,
  RIGHTS,
  ROLE_DESCRIPTION_MAX_LENGTH,
  ROLE_LINE_MAX_LENGTH,
  ROLE_LIST_MAX,
  ROLE_MISSION_MAX_LENGTH,
  ROLE_NAME_MAX_LENGTH,
  ROLE_SLUG,
  ROLE_SLUG_MAX_LENGTH,
  RULE_VALUE_MAX_LENGTH,
} from '@coreloom-uml/catalog'
import { IMPORT_ORIGINS } from '@coreloom-uml/llm'
import vine from '@vinejs/vine'
import type { FieldContext } from '@vinejs/vine/types'
import {
  AGENT_CATALOG_ID_MAX_LENGTH,
  AGENT_CONFIG_NAME_MAX_LENGTH,
  AGENT_IMPORT_MAX_LENGTH,
  AGENT_MERGE_CHOICES_MAX,
  AGENT_MERGE_SOURCES_MAX,
  AGENT_NOTES_MAX_LENGTH,
  AGENT_PROPOSAL_DIAGRAMS_MAX,
  AGENT_PROPOSAL_FEEDBACK_MAX_LENGTH,
  AGENT_PROPOSAL_SOURCES,
  AGENT_READY_RULES_PER_GROUP_MAX,
  AGENT_RULE_SOURCES,
  AGENT_RULE_TEXT_MAX_LENGTH,
  AGENT_SKILL_SLUG_MAX_LENGTH,
  AGENT_SKILLS_MAX,
  AgentProposalSource,
  TARGETS,
} from '#app/agent-configs/constants/agent-config'
import {
  PROPOSAL_SOURCE_TITLE_MAX_LENGTH,
  PROPOSAL_SOURCE_URL_MAX_LENGTH,
  PROPOSAL_SOURCES_MAX,
} from '#app/assistant/constants/assistant'
import { llmCallFields } from '#app/llm/validators/llm-input'
import { RESEARCH_REQUEST_MAX_LENGTH } from '#app/research/constants/research'
import { isWebUrl } from '#app/research/services/page-text'

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

/** An http(s) address, as a web research reads them. */
const webUrl = vine.createRule((value: unknown, _options: undefined, field: FieldContext) => {
  if (typeof value === 'string' && !isWebUrl(value)) {
    field.report('The {{ field }} field must be an http(s) address', 'webUrl', field)
  }
})

const catalogId = () => vine.string().trim().minLength(1).maxLength(AGENT_CATALOG_ID_MAX_LENGTH)

const nameInput = () =>
  vine.string().trim().minLength(1).maxLength(AGENT_CONFIG_NAME_MAX_LENGTH).use(withoutMarkers())
const projectIdInput = () => vine.number().withoutDecimals().min(1)
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
    targets: targetsInput().optional(),
    notes: notesInput().optional(),
  }),
)

/**
 * `POST /agent-configs/merge`: the caller's configurations to merge, in order, and the new one's
 * name. `choices` settles the conflicts a first call answered: for a group of ready-made rules
 * (`slot`) or a role (`slug`), the source whose version is kept.
 */
export const mergeAgentConfigsInput = vine.create(
  vine.object({
    name: nameInput(),
    sourceIds: vine
      .array(projectIdInput())
      .minLength(2)
      .maxLength(AGENT_MERGE_SOURCES_MAX)
      .distinct(),
    choices: vine
      .object({
        readyRules: vine
          .array(vine.object({ slot: catalogId(), sourceId: projectIdInput() }))
          .maxLength(AGENT_MERGE_CHOICES_MAX)
          .optional(),
        roles: vine
          .array(
            vine.object({
              slug: vine.string().trim().minLength(1).maxLength(ROLE_SLUG_MAX_LENGTH),
              sourceId: projectIdInput(),
            }),
          )
          .maxLength(AGENT_MERGE_CHOICES_MAX)
          .optional(),
      })
      .optional(),
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
 * `PUT /agent-configs/:id/ready-rules/:slot`: the rules held in that group, all of them (an
 * empty list removes them). The controller checks them against the group (`acceptedProblem`).
 */
export const updateAgentReadyRulesInput = vine.create(
  vine.object({
    rules: vine
      .array(
        vine.object({
          rule: catalogId(),
          /** The text of a rule that takes one. */
          value: vine
            .string()
            .trim()
            .maxLength(RULE_VALUE_MAX_LENGTH)
            .use(withoutMarkers())
            .nullable()
            .optional(),
        }),
      )
      .maxLength(AGENT_READY_RULES_PER_GROUP_MAX),
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

/** `POST /agent-configs/:id/roles` with `preset`: a copy of the catalog's ready-made role. */
export const createAgentRoleFromPresetInput = vine.create(vine.object({ preset: catalogId() }))

const roleLine = () =>
  vine.string().trim().minLength(1).maxLength(ROLE_LINE_MAX_LENGTH).use(withoutMarkers())
const roleLines = () => vine.array(roleLine()).maxLength(ROLE_LIST_MAX)

/**
 * A role's fields: shape, lengths and markers only. The controller checks the whole role
 * against the catalog's `roleSchema` (folders, rights that need another), a 422 otherwise.
 */
const roleFields = () => ({
  slug: vine.string().trim().maxLength(ROLE_SLUG_MAX_LENGTH).regex(ROLE_SLUG),
  name: vine.string().trim().minLength(1).maxLength(ROLE_NAME_MAX_LENGTH).use(withoutMarkers()),
  description: vine
    .string()
    .trim()
    .minLength(1)
    .maxLength(ROLE_DESCRIPTION_MAX_LENGTH)
    .use(withoutMarkers()),
  mission: vine.string().minLength(1).maxLength(ROLE_MISSION_MAX_LENGTH).use(withoutMarkers()),
  rights: vine.array(vine.enum(RIGHTS)).maxLength(RIGHTS.length),
  scope: roleLines().optional(),
  forbidden: roleLines().optional(),
  done: vine
    .object({ commands: roleLines().optional(), text: roleLine().nullable().optional() })
    .optional(),
  escalation: roleLine().nullable().optional(),
})

/** `POST /agent-configs/:id/roles` without `preset`: a role written by the owner. */
export const createAgentRoleInput = vine.create(vine.object(roleFields()))

/** `PATCH /agent-configs/:id/roles/:roleId`: omitted fields are left as is. */
export const updateAgentRoleInput = (() => {
  const { slug, name, description, mission, rights, ...optional } = roleFields()
  return vine.create(
    vine.object({
      slug: slug.optional(),
      name: name.optional(),
      description: description.optional(),
      mission: mission.optional(),
      rights: rights.optional(),
      ...optional,
    }),
  )
})()

/**
 * `POST /agent-configs/:id/proposals`: the user's provider, and what the model reads (`from`):
 * its diagrams (all of them when `diagramIds` is omitted, in the given order otherwise), or the
 * review `feedback` the owner pasted (required with `from: 'feedback'`, never stored).
 */
export const agentProposalsInput = vine.create(
  vine.object({
    ...llmCallFields(),
    from: vine.enum(AGENT_PROPOSAL_SOURCES),
    diagramIds: vine
      .array(vine.number().withoutDecimals().min(1))
      .minLength(1)
      .maxLength(AGENT_PROPOSAL_DIAGRAMS_MAX)
      .distinct()
      .optional(),
    feedback: vine
      .string()
      .trim()
      .minLength(1)
      .maxLength(AGENT_PROPOSAL_FEEDBACK_MAX_LENGTH)
      .optional()
      .requiredWhen('from', '=', AgentProposalSource.Feedback),
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
    /** `research` when the text is the findings of a web research rather than the owner's file. */
    origin: vine.enum(IMPORT_ORIGINS).optional(),
    /**
     * With `origin: 'research'` only: the assistant conversation the research was asked in. The
     * request and the proposals are then stored there, with the pages the research read.
     */
    conversation: vine
      .object({
        id: vine.number().withoutDecimals().positive(),
        request: vine.string().trim().minLength(1).maxLength(RESEARCH_REQUEST_MAX_LENGTH),
        sources: vine
          .array(
            vine.object({
              url: vine.string().maxLength(PROPOSAL_SOURCE_URL_MAX_LENGTH).use(webUrl()),
              title: vine.string().maxLength(PROPOSAL_SOURCE_TITLE_MAX_LENGTH).nullable(),
            }),
          )
          .maxLength(PROPOSAL_SOURCES_MAX),
      })
      .optional(),
  }),
)

/**
 * `POST /agent-configs/:id/research`: the user's provider and what to look for, usually with the
 * URLs to read (never stored or logged).
 */
export const agentResearchInput = vine.create(
  vine.object({
    ...llmCallFields(),
    request: vine.string().trim().minLength(1).maxLength(RESEARCH_REQUEST_MAX_LENGTH),
  }),
)

/** `GET /agent-configs/:id/generations` query params. */
export const listAgentGenerationsInput = vine.create(
  vine.object({
    page: vine.number().withoutDecimals().min(1).optional(),
    perPage: vine.number().withoutDecimals().min(1).optional(),
  }),
)

/**
 * `PUT /agent-configs/:id/skills`: the slugs of every skill it holds (an empty list removes them
 * all). A skill added must have an approved copy (`replaceAgentSkills`).
 */
export const updateAgentSkillsInput = vine.create(
  vine.object({
    skills: vine
      .array(vine.string().trim().minLength(1).maxLength(AGENT_SKILL_SLUG_MAX_LENGTH))
      .maxLength(AGENT_SKILLS_MAX)
      .distinct(),
  }),
)
