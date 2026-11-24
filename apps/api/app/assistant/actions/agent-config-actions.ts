import { createHash } from 'node:crypto'
import {
  acceptedProblem,
  findRuleGroup,
  MARKER_PREFIX,
  PRESET_TOPICS,
  RIGHTS,
  Right,
  ROLE_DESCRIPTION_MAX_LENGTH,
  ROLE_LINE_MAX_LENGTH,
  ROLE_LIST_MAX,
  ROLE_MISSION_MAX_LENGTH,
  ROLE_NAME_MAX_LENGTH,
  ROLE_PRESETS,
  ROLE_SLUG,
  ROLE_SLUG_MAX_LENGTH,
  RULE_PACKS,
  RULE_VALUE_MAX_LENGTH,
  RulePick,
  ruleSections,
  TARGETS,
  TOPICS,
} from '@coreloom-uml/catalog'
import { AssistantToolKind } from '@coreloom-uml/llm'
import { z } from 'zod'
import {
  AGENT_CATALOG_ID_MAX_LENGTH,
  AGENT_CONFIG_NAME_MAX_LENGTH,
  AGENT_GENERATIONS_KEPT,
  AGENT_ROLES_MAX,
  AGENT_RULE_TEXT_MAX_LENGTH,
  AgentRuleSource,
} from '#app/agent-configs/constants/agent-config'
import AgentConfig from '#app/agent-configs/models/agent-config'
import AgentConfigGeneration from '#app/agent-configs/models/agent-config-generation'
import AgentConfigReadyRule from '#app/agent-configs/models/agent-config-ready-rule'
import AgentConfigRole from '#app/agent-configs/models/agent-config-role'
import {
  createAgentConfig,
  deleteAgentConfig,
} from '#app/agent-configs/services/agent-config-writes'
import { createGeneration } from '#app/agent-configs/services/agent-generations'
import {
  checkRole,
  createRole,
  findPreset,
  type RoleOutcome,
  removeRole,
  roleFromFields,
  rolesOf,
  TOO_MANY_ROLES,
  unknownPreset,
  updateRole,
} from '#app/agent-configs/services/agent-roles'
import {
  addRule,
  type RuleOutcome,
  removeRule,
  replaceReadyRules,
  rulesOf,
  unknownSection,
  updateRule,
} from '#app/agent-configs/services/agent-rules'
import {
  AGENT_ROLE_SLUG_TAKEN,
  findOwnedAgentConfig,
  latestGeneration,
  PROJECT_HAS_AGENT_CONFIG,
  projectHasAgentConfig,
} from '#app/agent-configs/services/owned-agent-config'
import { agentRolesEnabled } from '#app/agent-configs/services/roles-flag'
import {
  type ActionApplied,
  ASSISTANT_READ_LIST_MAX,
  type AssistantAction,
  countOf,
  idInput,
  NOT_FOUND_SENTENCE,
  readAction,
  TARGET_NOT_FOUND,
  writeAction,
} from '#app/assistant/actions/action'
import {
  ActionFailure,
  ActionImpact,
  AssistantTargetKind,
} from '#app/assistant/constants/assistant'
import { findOwnedProject } from '#app/projects/services/owned-project'
import type User from '#app/users/models/user'

/** Ready-made rule groups one search answers. */
const READY_RULE_MATCHES_MAX = 10
const READY_RULE_QUERY_MAX_LENGTH = 100

/** As the routes' `withoutMarkers`: no text may open or close a managed block in a file. */
const withoutMarkers = (schema: z.ZodString) =>
  schema.refine((value) => !value.includes(MARKER_PREFIX), {
    message: `Cannot contain "${MARKER_PREFIX}"`,
  })
/** As the routes' `catalogId`. */
const catalogId = () => z.string().trim().min(1).max(AGENT_CATALOG_ID_MAX_LENGTH)
/** As the routes' `ruleText`. */
const ruleText = () => withoutMarkers(z.string().trim().min(1).max(AGENT_RULE_TEXT_MAX_LENGTH))

const configId = { agentConfigId: idInput() }
/** A ready-made rule to hold: `value` only for a rule that takes a text. */
const readyRule = {
  slot: catalogId(),
  rule: catalogId(),
  value: withoutMarkers(z.string().trim().max(RULE_VALUE_MAX_LENGTH)).nullable().optional(),
}
/** Rules of each kind one creation carries: what a card can show and an owner can read. */
const CREATED_RULES_MAX = 20

/** Presets one search answers, and how much of a mission the model reads in a list. */
const ROLE_PRESET_MATCHES_MAX = 10
const ROLE_PRESET_QUERY_MAX_LENGTH = 100
const MISSION_PREVIEW_LENGTH = 200

/** As the routes' `roleLine` and `roleLines`. */
const roleLine = () => withoutMarkers(z.string().trim().min(1).max(ROLE_LINE_MAX_LENGTH))
const roleLines = () => z.array(roleLine()).max(ROLE_LIST_MAX)
/** As the routes' `roleFields`: shape, lengths and markers; `roleSchema` checks the whole role. */
const roleFields = {
  slug: z.string().trim().max(ROLE_SLUG_MAX_LENGTH).regex(ROLE_SLUG),
  name: withoutMarkers(z.string().trim().min(1).max(ROLE_NAME_MAX_LENGTH)),
  description: withoutMarkers(z.string().trim().min(1).max(ROLE_DESCRIPTION_MAX_LENGTH)),
  mission: withoutMarkers(z.string().min(1).max(ROLE_MISSION_MAX_LENGTH)),
  rights: z.array(z.enum(Right)).max(RIGHTS.length),
  scope: roleLines().optional(),
  forbidden: roleLines().optional(),
  done: z
    .object({ commands: roleLines().optional(), text: roleLine().nullable().optional() })
    .optional(),
  escalation: roleLine().nullable().optional(),
}
const roleId = { roleId: idInput() }
/** Roles exist only while `agent-roles` is on for the user. */
const roles = { available: agentRolesEnabled }

/** The beginning of a long text, marked as cut. */
function cut(text: string, length: number) {
  return text.length <= length ? text : `${text.slice(0, length - 1).trimEnd()}…`
}

async function configName(agentConfigId: number, user: User) {
  return (await findOwnedAgentConfig(agentConfigId, user))?.name ?? TARGET_NOT_FOUND
}

/** A rule route's outcome as an action's: what it changed is the configuration. */
function applied(outcome: RuleOutcome): ActionApplied {
  if ('notFound' in outcome) return { failure: ActionFailure.NotFound }
  if ('refused' in outcome)
    return { failure: ActionFailure.Invalid, message: outcome.refused.error.message }
  return { kind: AssistantTargetKind.AgentConfig, id: outcome.config.id }
}

export const AGENT_CONFIG_ACTIONS: readonly AssistantAction[] = [
  readAction({
    name: 'list_agent_configs',
    description:
      "Lists the owner's agent conventions, newest first: id, name and project id (null outside any project).",
    input: z.object({}),
    kind: AssistantToolKind.Read,
    async read(_input, user) {
      const configs = await AgentConfig.query()
        .where('userId', user.id)
        .orderBy('updatedAt', 'desc')
        .orderBy('id', 'desc')
        .limit(ASSISTANT_READ_LIST_MAX)
      return configs.map((config) => ({
        id: config.id,
        name: config.name,
        projectId: config.projectId,
      }))
    },
  }),
  readAction({
    name: 'read_agent_config',
    description:
      "Reads one of the owner's agent conventions: its revision, its own rules (id, section, text), the ready-made rules it holds (slot, rule, text), the sections an own rule may go to, its roles when roles are available, and its generated files' newest generation (revision rendered, date).",
    input: z.object(configId),
    kind: AssistantToolKind.Read,
    async read({ agentConfigId }, user) {
      const config = await findOwnedAgentConfig(agentConfigId, user)
      if (!config) return { error: NOT_FOUND_SENTENCE }
      const rules = await rulesOf(config)
      const ready = await AgentConfigReadyRule.query()
        .where('agentConfigId', config.id)
        .orderBy('slot', 'asc')
      const newest = await latestGeneration(config)
      const held = await rolesOf(config)
      return {
        id: config.id,
        name: config.name,
        projectId: config.projectId,
        revision: config.revision,
        ...((await agentRolesEnabled(user)) && {
          roles: held.map((role) => ({
            id: role.id,
            slug: role.slug,
            name: role.name,
            mission: cut(role.mission, MISSION_PREVIEW_LENGTH),
            scope: role.scope,
          })),
        }),
        // Never a file's content: the owner pulls the files with the CLI.
        generations: {
          kept: await countOf(AgentConfigGeneration.query().where('agentConfigId', config.id)),
          newest: newest && {
            revision: newest.revision,
            createdAt: newest.createdAt.toISO(),
          },
        },
        // Last: the longest part, so a result cut short still carries the roles above.
        rules: rules.map((rule) => ({ id: rule.id, section: rule.section, text: rule.text })),
        readyRules: ready.map((row) => ({ slot: row.slot, rule: row.rule, value: row.value })),
        sections: ruleSections(RULE_PACKS),
      }
    },
  }),
  readAction({
    name: 'find_role_presets',
    description:
      'Searches the catalog of ready-made roles by words (a job, a practice), by tag, or both. A role describes a mission for a coding agent, the folders it works in and its rights. Use it before add_role_from_preset.',
    input: z
      .object({
        query: z.string().trim().min(1).max(ROLE_PRESET_QUERY_MAX_LENGTH).optional(),
        topic: z.enum(TOPICS).optional(),
      })
      .refine((input) => input.query !== undefined || input.topic !== undefined, {
        message: 'Give words, a tag, or both',
      }),
    kind: AssistantToolKind.Read,
    ...roles,
    async read({ query, topic }) {
      const words = query?.toLowerCase().split(/\s+/) ?? []
      return ROLE_PRESETS.filter((preset) => {
        if (topic && !PRESET_TOPICS[preset.slug]?.includes(topic)) return false
        const text = [preset.slug, preset.name, preset.description].join(' ').toLowerCase()
        return words.every((word) => text.includes(word))
      })
        .slice(0, ROLE_PRESET_MATCHES_MAX)
        .map((preset) => ({
          preset: preset.slug,
          name: preset.name,
          topics: PRESET_TOPICS[preset.slug] ?? [],
          mission: cut(preset.mission, MISSION_PREVIEW_LENGTH),
        }))
    },
  }),
  readAction({
    name: 'find_ready_rules',
    description:
      'Searches the catalog of ready-made rules by words (a language, a tool, a practice): each group found has a slot, whether it holds one rule or many, and its rules (id, what it writes, whether it takes a text). Use it before set_ready_rule.',
    input: z.object({ query: z.string().trim().min(1).max(READY_RULE_QUERY_MAX_LENGTH) }),
    kind: AssistantToolKind.Read,
    async read({ query }) {
      const words = query.toLowerCase().split(/\s+/)
      return RULE_PACKS.flatMap((pack) => pack.groups)
        .filter((group) => {
          const text = [
            group.slot,
            group.section,
            group.label.en,
            ...group.rules.flatMap((rule) => [rule.id, ...rule.lines]),
          ]
            .join(' ')
            .toLowerCase()
          return words.every((word) => text.includes(word))
        })
        .slice(0, READY_RULE_MATCHES_MAX)
        .map((group) => ({
          slot: group.slot,
          label: group.label.en,
          holds: group.pick,
          rules: group.rules.map((rule) => ({
            id: rule.id,
            writes: rule.lines,
            takesText: rule.input === true,
          })),
        }))
    },
  }),
  writeAction({
    name: 'create_agent_config',
    description:
      "Proposes to create agent conventions with the rules they start with, in one of the owner's projects when projectId is given (a project holds at most one), outside any project otherwise. targets are the coding tools the files are made for: ask the owner when nothing says which. rules are the owner's own rules (a section and a text each); readyRules are ready-made rules of the catalog (slot and rule from find_ready_rules), preferred whenever one says the same thing.",
    input: z.object({
      name: withoutMarkers(z.string().trim().min(1).max(AGENT_CONFIG_NAME_MAX_LENGTH)),
      projectId: idInput().optional(),
      targets: z.array(z.enum(TARGETS)).min(1).max(TARGETS.length),
      rules: z
        .array(z.object({ section: catalogId(), text: ruleText() }))
        .max(CREATED_RULES_MAX)
        .optional(),
      readyRules: z.array(z.object(readyRule)).max(CREATED_RULES_MAX).optional(),
    }),
    kind: AssistantToolKind.Write,
    problem: createdRulesProblem,
    async subject({ projectId }, user) {
      if (projectId === undefined) return null
      return (await findOwnedProject(projectId, user))?.name ?? TARGET_NOT_FOUND
    },
    async currentProblem({ projectId }) {
      if (projectId === undefined || !(await projectHasAgentConfig(projectId))) return null
      return PROJECT_HAS_AGENT_CONFIG.error.message
    },
    async apply({ rules = [], readyRules = [], ...fields }, user, client) {
      // Before anything is written: a rule refused later would leave half of the proposal behind.
      const refused = createdRulesProblem({ ...fields, rules, readyRules })
      if (refused) return { failure: ActionFailure.Invalid, message: refused }
      const created = await createAgentConfig(user, fields, client)
      if ('notFound' in created) return { failure: ActionFailure.NotFound }
      if ('conflict' in created)
        return { failure: ActionFailure.Conflict, message: PROJECT_HAS_AGENT_CONFIG.error.message }
      const { id } = created.config
      for (const rule of rules) {
        const outcome = applied(
          await addRule(id, user, { ...rule, source: AgentRuleSource.Llm }, client),
        )
        if ('failure' in outcome) return outcome
      }
      for (const [slot, held] of bySlot(readyRules)) {
        const result = await replaceReadyRules(id, user, slot, () => held, client)
        if ('notFound' in result) return { failure: ActionFailure.NotFound }
        if ('refused' in result)
          return { failure: ActionFailure.Invalid, message: result.refused.error.message }
      }
      return { kind: AssistantTargetKind.AgentConfig, id }
    },
  }),
  writeAction({
    name: 'add_rule',
    description:
      "Proposes to add one of the owner's own rules to agent conventions, in one of the sections read_agent_config lists.",
    input: z.object({ ...configId, section: catalogId(), text: ruleText() }),
    kind: AssistantToolKind.Write,
    problem: ({ section }) => sectionProblem(section),
    subject: ({ agentConfigId }, user) => configName(agentConfigId, user),
    async apply({ agentConfigId, section, text }, user, client) {
      return applied(await addRule(agentConfigId, user, { section, text }, client))
    },
  }),
  writeAction({
    name: 'edit_rule',
    description:
      "Proposes to change the text or the section of one of the owner's own rules (ids from read_agent_config).",
    input: z
      .object({
        ...configId,
        ruleId: idInput(),
        text: ruleText().optional(),
        section: catalogId().optional(),
      })
      .refine((input) => input.text !== undefined || input.section !== undefined, {
        message: 'Give a text or a section',
      }),
    kind: AssistantToolKind.Write,
    problem: ({ section }) => sectionProblem(section),
    subject: ({ agentConfigId, ruleId }, user) => currentRuleText(agentConfigId, ruleId, user),
    async apply({ agentConfigId, ruleId, text, section }, user, client) {
      return applied(await updateRule(agentConfigId, ruleId, user, { text, section }, client))
    },
  }),
  writeAction({
    name: 'remove_rule',
    description: "Proposes to remove one of the owner's own rules (ids from read_agent_config).",
    input: z.object({ ...configId, ruleId: idInput() }),
    kind: AssistantToolKind.Write,
    destructive: true,
    subject: ({ agentConfigId, ruleId }, user) => currentRuleText(agentConfigId, ruleId, user),
    async apply({ agentConfigId, ruleId }, user, client) {
      const notFound = await removeRule(agentConfigId, ruleId, user, client)
      if (notFound) return { failure: ActionFailure.NotFound }
      return { kind: AssistantTargetKind.AgentConfig, id: agentConfigId }
    },
  }),
  writeAction({
    name: 'set_ready_rule',
    description:
      'Proposes that agent conventions hold one ready-made rule (slot and rule from find_ready_rules; value only for a rule that takes a text). In a group that holds one rule, it replaces the rule held.',
    input: z.object({ ...configId, ...readyRule }),
    kind: AssistantToolKind.Write,
    // The rule alone, as the catalog checks it; what the group already holds is checked on accept.
    problem({ slot, rule, value }) {
      const group = findRuleGroup(RULE_PACKS, slot)
      if (!group) return `Unknown slot: ${slot}. Find one with find_ready_rules.`
      return acceptedProblem(group, [{ rule, value: value ?? null }])
    },
    subject: ({ agentConfigId }, user) => configName(agentConfigId, user),
    async apply({ agentConfigId, slot, rule, value }, user, client) {
      const chosen = { rule, value: value ?? null }
      const group = findRuleGroup(RULE_PACKS, slot)
      const result = await replaceReadyRules(
        agentConfigId,
        user,
        slot,
        (held) => {
          // A rule that stands alone, or a group of one rule, holds only the rule chosen.
          const alone = (id: string) => group?.rules.find((item) => item.id === id)?.alone === true
          if (group?.pick === RulePick.One || alone(rule) || held.some((item) => alone(item.rule)))
            return [chosen]
          return [...held.filter((item) => item.rule !== rule), chosen]
        },
        client,
      )
      if ('notFound' in result) return { failure: ActionFailure.NotFound }
      if ('refused' in result)
        return { failure: ActionFailure.Invalid, message: result.refused.error.message }
      return { kind: AssistantTargetKind.AgentConfig, id: result.id }
    },
  }),
  writeAction({
    name: 'add_role_from_preset',
    description:
      'Proposes to add a ready-made role (preset from find_role_presets) to agent conventions: a mission for a coding agent, the folders it works in and its rights.',
    input: z.object({ ...configId, preset: catalogId() }),
    kind: AssistantToolKind.Write,
    ...roles,
    problem: ({ preset }) => (findPreset(preset) ? null : unknownPreset(preset).error.message),
    subject: ({ agentConfigId }, user) => configName(agentConfigId, user),
    currentProblem: ({ agentConfigId, preset }, user) => roomFor(agentConfigId, preset, user),
    async apply({ agentConfigId, preset }, user, client) {
      return roleApplied(await createRole(agentConfigId, user, { preset }, client))
    },
  }),
  writeAction({
    name: 'add_role',
    description:
      'Proposes to add a role written for the owner to agent conventions: a mission for a coding agent, the folders it works in (scope, none for the whole repository) and its rights (every role can read).',
    input: z.object({ ...configId, ...roleFields }),
    kind: AssistantToolKind.Write,
    ...roles,
    problem({ agentConfigId: _id, ...fields }) {
      const checked = checkRole(roleFromFields(fields))
      return 'refused' in checked ? refusalText(checked.refused) : null
    },
    subject: ({ agentConfigId }, user) => configName(agentConfigId, user),
    currentProblem: ({ agentConfigId, slug }, user) => roomFor(agentConfigId, slug, user),
    async apply({ agentConfigId, ...fields }, user, client) {
      return roleApplied(await createRole(agentConfigId, user, fields, client))
    },
  }),
  writeAction({
    name: 'edit_role',
    description:
      'Proposes to change some fields of a role of agent conventions (ids from read_agent_config); the fields left out stay as they are.',
    input: z
      .object({ ...configId, ...roleId, ...partial(roleFields) })
      .refine(({ agentConfigId: _c, roleId: _r, ...fields }) => Object.keys(fields).length > 0, {
        message: 'Give at least one field to change',
      }),
    kind: AssistantToolKind.Write,
    ...roles,
    subject: async ({ agentConfigId, roleId }, user) =>
      (await findRole(agentConfigId, roleId, user))?.name ?? TARGET_NOT_FOUND,
    currentProblem: ({ agentConfigId, roleId, slug }, user) =>
      slug === undefined ? Promise.resolve(null) : roomFor(agentConfigId, slug, user, roleId),
    before: ({ agentConfigId, roleId }, user) => roleFingerprint(agentConfigId, roleId, user),
    async apply({ agentConfigId, roleId, ...fields }, user, client) {
      return roleApplied(await updateRole(agentConfigId, roleId, user, fields, client))
    },
  }),
  writeAction({
    name: 'remove_role',
    description:
      'Proposes to remove a role from agent conventions (ids from read_agent_config). It cannot be undone: propose it only when the owner clearly asked for it.',
    input: z.object({ ...configId, ...roleId }),
    kind: AssistantToolKind.Write,
    ...roles,
    destructive: true,
    subject: async ({ agentConfigId, roleId }, user) =>
      (await findRole(agentConfigId, roleId, user))?.name ?? TARGET_NOT_FOUND,
    before: ({ agentConfigId, roleId }, user) => roleFingerprint(agentConfigId, roleId, user),
    async apply({ agentConfigId, roleId }, user, client) {
      if (await removeRole(agentConfigId, roleId, user, client))
        return { failure: ActionFailure.NotFound }
      return { kind: AssistantTargetKind.AgentConfig, id: agentConfigId }
    },
  }),
  writeAction({
    name: 'generate_files',
    description:
      'Proposes to render the files of agent conventions from their current state (a new generation); the owner then pulls them into the repository with the CLI.',
    input: z.object(configId),
    kind: AssistantToolKind.Write,
    // Only the newest generations are kept: past the limit, the oldest is dropped.
    destructive: (_before, impact) => (impact[ActionImpact.DroppedGenerations] ?? 0) > 0,
    subject: ({ agentConfigId }, user) => configName(agentConfigId, user),
    // The revision it renders: a change to the conventions since makes the card stale.
    async before({ agentConfigId }, user) {
      const config = await findOwnedAgentConfig(agentConfigId, user)
      return config ? String(config.revision) : null
    },
    async impact({ agentConfigId }, user) {
      const config = await findOwnedAgentConfig(agentConfigId, user)
      if (!config) return {}
      const kept = await countOf(AgentConfigGeneration.query().where('agentConfigId', config.id))
      return { [ActionImpact.DroppedGenerations]: kept - AGENT_GENERATIONS_KEPT + 1 }
    },
    async apply({ agentConfigId }, user, client) {
      const generation = await createGeneration(agentConfigId, user, client)
      if (!generation) return { failure: ActionFailure.NotFound }
      return { kind: AssistantTargetKind.AgentConfig, id: agentConfigId }
    },
  }),
  writeAction({
    name: 'delete_agent_config',
    description:
      "Proposes to delete one of the owner's agent conventions with all their rules, ready-made rules, roles and generated files. It cannot be undone: propose it only when the owner clearly asked for this deletion.",
    input: z.object(configId),
    kind: AssistantToolKind.Write,
    destructive: true,
    subject: ({ agentConfigId }, user) => configName(agentConfigId, user),
    async impact({ agentConfigId }, user) {
      const config = await findOwnedAgentConfig(agentConfigId, user)
      if (!config) return {}
      const held = { agentConfigId: config.id }
      return {
        [ActionImpact.Rules]: (await rulesOf(config)).length,
        [ActionImpact.ReadyRules]: await countOf(AgentConfigReadyRule.query().where(held)),
        [ActionImpact.Roles]: await countOf(AgentConfigRole.query().where(held)),
        [ActionImpact.Generations]: await countOf(AgentConfigGeneration.query().where(held)),
      }
    },
    async apply({ agentConfigId }, user, client) {
      const config = await findOwnedAgentConfig(agentConfigId, user)
      if (!config) return { failure: ActionFailure.NotFound }
      await deleteAgentConfig(config, client)
      return { deleted: true }
    },
  }),
]

/** The ready-made rules of an input, gathered by the group (slot) that holds them. */
function bySlot(rules: { slot: string; rule: string; value?: string | null }[]) {
  const slots = new Map<string, { rule: string; value: string | null }[]>()
  for (const { slot, rule, value } of rules)
    slots.set(slot, [...(slots.get(slot) ?? []), { rule, value: value ?? null }])
  return slots
}

/** Why the rules a creation carries could never be held: checked when proposed and when accepted. */
function createdRulesProblem({
  targets,
  rules = [],
  readyRules = [],
}: {
  targets: readonly string[]
  rules?: { section: string }[]
  readyRules?: Parameters<typeof bySlot>[0]
}): string | null {
  if (new Set(targets).size !== targets.length) return 'A target is listed twice.'
  for (const { section } of rules) {
    const refused = sectionProblem(section)
    if (refused) return refused
  }
  for (const [slot, held] of bySlot(readyRules)) {
    const group = findRuleGroup(RULE_PACKS, slot)
    if (!group) return `Unknown slot: ${slot}. Find one with find_ready_rules.`
    const refused = acceptedProblem(group, held)
    if (refused) return `${slot}: ${refused}`
  }
  return null
}

/** As the rule routes: a section the catalog does not have is refused. */
function sectionProblem(section: string | undefined): string | null {
  return section === undefined ? null : (unknownSection(section)?.error.message ?? null)
}

/** The current text of one of the owner's rules, as the subject of an action on it. */
async function currentRuleText(agentConfigId: number, ruleId: number, user: User) {
  const config = await findOwnedAgentConfig(agentConfigId, user)
  if (!config) return TARGET_NOT_FOUND
  const rule = (await rulesOf(config)).find((item) => item.id === ruleId)
  return rule?.text ?? TARGET_NOT_FOUND
}

/** Every field optional, as the route's update input. */
function partial<T extends Record<string, z.ZodType>>(fields: T) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, schema]) => [key, schema.optional()]),
  ) as { [K in keyof T]: z.ZodOptional<T[K]> }
}

function refusalText(refused: { error: { message: string; problems?: string[] } }) {
  const { message, problems } = refused.error
  return problems?.length ? `${message}: ${problems.join('; ')}` : message
}

/** A role route's outcome as an action's: what it changed is the configuration. */
function roleApplied(outcome: RoleOutcome): ActionApplied {
  if ('notFound' in outcome) return { failure: ActionFailure.NotFound }
  if ('refused' in outcome)
    return { failure: ActionFailure.Invalid, message: refusalText(outcome.refused) }
  if ('conflict' in outcome)
    return { failure: ActionFailure.Conflict, message: AGENT_ROLE_SLUG_TAKEN.error.message }
  return { kind: AssistantTargetKind.AgentConfig, id: outcome.config.id }
}

/**
 * Why the configuration cannot take a role with this slug now: the slug is another role's, or
 * (for a new role, without `exceptRoleId`) it already holds as many roles as it may.
 */
async function roomFor(agentConfigId: number, slug: string, user: User, exceptRoleId?: number) {
  const config = await findOwnedAgentConfig(agentConfigId, user)
  if (!config) return null
  const held = await rolesOf(config)
  if (held.some((role) => role.id !== exceptRoleId && role.slug === slug))
    return AGENT_ROLE_SLUG_TAKEN.error.message
  if (exceptRoleId === undefined && held.length >= AGENT_ROLES_MAX)
    return TOO_MANY_ROLES.error.message
  return null
}

async function findRole(agentConfigId: number, roleId: number, user: User) {
  const config = await findOwnedAgentConfig(agentConfigId, user)
  if (!config) return null
  return rolesOf(config).where('id', roleId).first()
}

/** A short digest of the role as stored, so a card on a role edited since is stale. */
async function roleFingerprint(agentConfigId: number, roleId: number, user: User) {
  const role = await findRole(agentConfigId, roleId, user)
  if (!role) return null
  return createHash('sha256').update(JSON.stringify(role.toRole())).digest('hex').slice(0, 16)
}
