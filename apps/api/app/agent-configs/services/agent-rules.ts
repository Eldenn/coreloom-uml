import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { acceptedProblem, findRuleGroup, RULE_PACKS, ruleSections } from '@coreloom-uml/catalog'
import { AGENT_RULES_MAX, AgentRuleSource } from '#app/agent-configs/constants/agent-config'
import type AgentConfig from '#app/agent-configs/models/agent-config'
import AgentConfigReadyRule from '#app/agent-configs/models/agent-config-ready-rule'
import AgentConfigRule from '#app/agent-configs/models/agent-config-rule'
import {
  AGENT_CONFIG_NOT_FOUND,
  AGENT_RULE_NOT_FOUND,
  bumpRevision,
  findOwnedAgentConfig,
} from '#app/agent-configs/services/owned-agent-config'
import type User from '#app/users/models/user'

/*
 * The writes of the rules routes, shared with the assistant's accepted actions: each runs in one
 * transaction with the configuration locked (a savepoint of `client` when given), and bumps its
 * revision when something changed.
 */

type Refusal = { error: { message: string } }
type NotFound = typeof AGENT_CONFIG_NOT_FOUND | typeof AGENT_RULE_NOT_FOUND
export type RuleOutcome =
  | { notFound: NotFound }
  | { refused: Refusal }
  | { config: AgentConfig; rule: AgentConfigRule }

const TOO_MANY_RULES = {
  error: { message: `A configuration holds at most ${AGENT_RULES_MAX} rules.` },
} as const

function unknownSection(section: string): Refusal | null {
  const sections = ruleSections(RULE_PACKS)
  return sections.includes(section)
    ? null
    : { error: { message: `Unknown section: ${section}. Expected one of: ${sections.join(', ')}` } }
}

export function rulesOf(config: AgentConfig, client?: TransactionClientContract) {
  return AgentConfigRule.query({ client })
    .where('agentConfigId', config.id)
    .orderBy('position', 'asc')
    .orderBy('id', 'asc')
}

/** Saves positions 0..n-1 in the given order. */
async function renumber(rules: AgentConfigRule[], trx: TransactionClientContract) {
  for (const [index, rule] of rules.entries()) {
    if (rule.position === index) continue
    rule.useTransaction(trx)
    rule.position = index
    await rule.save()
  }
}

/** Adds one of the owner's rules at the end (`POST /agent-configs/:id/rules`, `add_rule`). */
export function addRule(
  configId: number,
  user: User,
  fields: { section: string; text: string; source?: AgentRuleSource },
  client?: TransactionClientContract,
): Promise<RuleOutcome> {
  return (client ?? db).transaction(async (trx) => {
    const config = await findOwnedAgentConfig(configId, user, trx)
    if (!config) return { notFound: AGENT_CONFIG_NOT_FOUND }
    const refused = unknownSection(fields.section)
    if (refused) return { refused }
    const rules = await rulesOf(config, trx)
    if (rules.length >= AGENT_RULES_MAX) return { refused: TOO_MANY_RULES }

    const rule = await AgentConfigRule.create(
      {
        agentConfigId: config.id,
        section: fields.section,
        text: fields.text,
        source: fields.source ?? AgentRuleSource.Manual,
        position: rules.length,
      },
      { client: trx },
    )
    await bumpRevision(config, trx)
    return { config, rule }
  })
}

/**
 * Changes one of the owner's rules; omitted fields are left as is. Moving it (`position`) shifts
 * the others, the order kept gap-free (`PATCH …/rules/:ruleId`, `edit_rule`).
 */
export function updateRule(
  configId: number,
  ruleId: number,
  user: User,
  { section, text, position }: { section?: string; text?: string; position?: number },
  client?: TransactionClientContract,
): Promise<RuleOutcome> {
  return (client ?? db).transaction(async (trx) => {
    const config = await findOwnedAgentConfig(configId, user, trx)
    if (!config) return { notFound: AGENT_CONFIG_NOT_FOUND }
    const rules = await rulesOf(config, trx)
    const rule = rules.find((item) => item.id === ruleId)
    if (!rule) return { notFound: AGENT_RULE_NOT_FOUND }
    if (section !== undefined) {
      const refused = unknownSection(section)
      if (refused) return { refused }
    }

    let changed = false
    rule.useTransaction(trx)
    if (section !== undefined && section !== rule.section) {
      rule.section = section
      changed = true
    }
    if (text !== undefined && text !== rule.text) {
      rule.text = text
      changed = true
    }
    if (changed) await rule.save()

    if (position !== undefined) {
      const others = rules.filter((item) => item.id !== rule.id)
      const index = Math.min(position, others.length)
      if (rules.indexOf(rule) !== index) {
        others.splice(index, 0, rule)
        await renumber(others, trx)
        changed = true
      }
    }
    if (changed) await bumpRevision(config, trx)
    return { config, rule }
  })
}

/** Removes one of the owner's rules (`DELETE …/rules/:ruleId`, `remove_rule`); null when done. */
export function removeRule(
  configId: number,
  ruleId: number,
  user: User,
  client?: TransactionClientContract,
): Promise<NotFound | null> {
  return (client ?? db).transaction(async (trx) => {
    const config = await findOwnedAgentConfig(configId, user, trx)
    if (!config) return AGENT_CONFIG_NOT_FOUND
    const rules = await rulesOf(config, trx)
    const rule = rules.find((item) => item.id === ruleId)
    if (!rule) return AGENT_RULE_NOT_FOUND

    await rule.useTransaction(trx).delete()
    await renumber(
      rules.filter((item) => item.id !== rule.id),
      trx,
    )
    await bumpRevision(config, trx)
    return null
  })
}

export type ReadyRuleChoice = { rule: string; value: string | null }

/**
 * Replaces the ready-made rules held in one group, named by its slot (`PUT …/ready-rules/:slot`,
 * `set_ready_rule`). `choose` gets the rules the group holds now, read with the configuration
 * locked, and answers the rules it should hold. Nothing is saved unless they can be held together
 * (`acceptedProblem`); the revision goes up only when the group's rules changed.
 */
export async function replaceReadyRules(
  configId: number,
  user: User,
  slot: string,
  choose: (held: ReadyRuleChoice[]) => ReadyRuleChoice[],
  client?: TransactionClientContract,
): Promise<{ notFound: typeof AGENT_CONFIG_NOT_FOUND } | { refused: Refusal } | AgentConfig> {
  const group = findRuleGroup(RULE_PACKS, slot)
  if (!group) return { refused: { error: { message: `Unknown slot: ${slot}` } } }

  return (client ?? db).transaction(async (trx) => {
    // Locked until the transaction ends, so two requests cannot both replace the group.
    const locked = await findOwnedAgentConfig(configId, user, trx)
    if (!locked) return { notFound: AGENT_CONFIG_NOT_FOUND }
    const held = () =>
      AgentConfigReadyRule.query({ client: trx })
        .where('agentConfigId', locked.id)
        .where('slot', slot)
    const rows = await held()
    const next = choose(rows.map((row) => ({ rule: row.rule, value: row.value })))
    const problem = acceptedProblem(group, next)
    if (problem) return { refused: { error: { message: problem } } }
    const same =
      rows.length === next.length &&
      next.every((item) => rows.some((row) => row.rule === item.rule && row.value === item.value))
    if (same) return locked
    await held().delete()
    await AgentConfigReadyRule.createMany(
      next.map((item) => ({ agentConfigId: locked.id, slot, ...item })),
      { client: trx },
    )
    await bumpRevision(locked, trx)
    return locked
  })
}
