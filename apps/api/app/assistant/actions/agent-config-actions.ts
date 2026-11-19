import {
  acceptedProblem,
  findRuleGroup,
  MARKER_PREFIX,
  RULE_PACKS,
  RULE_VALUE_MAX_LENGTH,
  RulePick,
  ruleSections,
} from '@coreloom-uml/catalog'
import { AssistantToolKind } from '@coreloom-uml/llm'
import { z } from 'zod'
import {
  AGENT_CATALOG_ID_MAX_LENGTH,
  AGENT_RULE_TEXT_MAX_LENGTH,
} from '#app/agent-configs/constants/agent-config'
import AgentConfig from '#app/agent-configs/models/agent-config'
import AgentConfigReadyRule from '#app/agent-configs/models/agent-config-ready-rule'
import {
  addRule,
  type RuleOutcome,
  removeRule,
  replaceReadyRules,
  rulesOf,
  unknownSection,
  updateRule,
} from '#app/agent-configs/services/agent-rules'
import { findOwnedAgentConfig } from '#app/agent-configs/services/owned-agent-config'
import {
  type ActionApplied,
  ASSISTANT_READ_LIST_MAX,
  type AssistantAction,
  idInput,
  NOT_FOUND_SENTENCE,
  readAction,
  TARGET_NOT_FOUND,
  writeAction,
} from '#app/assistant/actions/action'
import { ActionFailure, AssistantTargetKind } from '#app/assistant/constants/assistant'
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
      "Reads one of the owner's agent conventions: its own rules (id, section, text), the ready-made rules it holds (slot, rule, text), and the sections an own rule may go to.",
    input: z.object(configId),
    kind: AssistantToolKind.Read,
    async read({ agentConfigId }, user) {
      const config = await findOwnedAgentConfig(agentConfigId, user)
      if (!config) return { error: NOT_FOUND_SENTENCE }
      const rules = await rulesOf(config)
      const ready = await AgentConfigReadyRule.query()
        .where('agentConfigId', config.id)
        .orderBy('slot', 'asc')
      return {
        id: config.id,
        name: config.name,
        projectId: config.projectId,
        rules: rules.map((rule) => ({ id: rule.id, section: rule.section, text: rule.text })),
        readyRules: ready.map((row) => ({ slot: row.slot, rule: row.rule, value: row.value })),
        sections: ruleSections(RULE_PACKS),
      }
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
    input: z.object({
      ...configId,
      slot: catalogId(),
      rule: catalogId(),
      value: withoutMarkers(z.string().trim().max(RULE_VALUE_MAX_LENGTH)).nullable().optional(),
    }),
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
]

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
