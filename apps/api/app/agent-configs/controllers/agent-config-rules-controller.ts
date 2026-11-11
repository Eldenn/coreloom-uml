import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { ruleSections } from '@coreloom-uml/catalog'
import { AGENT_RULES_MAX, AgentRuleSource } from '#app/agent-configs/constants/agent-config'
import type AgentConfig from '#app/agent-configs/models/agent-config'
import AgentConfigRule from '#app/agent-configs/models/agent-config-rule'
import { serializeAgentRule } from '#app/agent-configs/serializers/agent-config-serializer'
import { resolveQuestionnaires } from '#app/agent-configs/services/agent-context'
import {
  AGENT_CONFIG_NOT_FOUND,
  AGENT_RULE_NOT_FOUND,
  agentConfigImpact,
  bumpRevision,
  findOwnedAgentConfig,
} from '#app/agent-configs/services/owned-agent-config'
import {
  createAgentRuleInput,
  updateAgentRuleInput,
} from '#app/agent-configs/validators/agent-configs-input'

const TOO_MANY_RULES = {
  error: { message: `A configuration holds at most ${AGENT_RULES_MAX} rules.` },
} as const

function unknownSection(config: AgentConfig, section: string) {
  const sections = ruleSections(resolveQuestionnaires(config.questionnaires))
  return sections.includes(section)
    ? null
    : { error: { message: `Unknown section: ${section}. Expected one of: ${sections.join(', ')}` } }
}

function rulesOf(config: AgentConfig, trx: TransactionClientContract) {
  return AgentConfigRule.query({ client: trx })
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

/** Accepted rules of a configuration: written by hand or accepted from a proposal. */
export default class AgentConfigRulesController {
  async store({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()

    const { section, text, source } = await request.validateUsing(createAgentRuleInput)

    const result = await db.transaction(async (trx) => {
      const config = await findOwnedAgentConfig(params.id, user, trx)
      if (!config) return { notFound: true as const }
      const refused = unknownSection(config, section)
      if (refused) return { refused }
      const rules = await rulesOf(config, trx)
      if (rules.length >= AGENT_RULES_MAX) return { refused: TOO_MANY_RULES }

      const rule = await AgentConfigRule.create(
        {
          agentConfigId: config.id,
          section,
          text,
          source: source ?? AgentRuleSource.Manual,
          position: rules.length,
        },
        { client: trx },
      )
      await bumpRevision(config, trx)
      return { config, rule }
    })

    if ('notFound' in result) return response.notFound(AGENT_CONFIG_NOT_FOUND)
    if ('refused' in result) return response.unprocessableEntity(result.refused)
    return response.created({
      rule: serializeAgentRule(result.rule),
      impact: await agentConfigImpact(result.config),
    })
  }

  /** Moving a rule (`position`) shifts the others; the order is kept gap-free. */
  async update({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()

    const { section, text, position } = await request.validateUsing(updateAgentRuleInput)

    const result = await db.transaction(async (trx) => {
      const config = await findOwnedAgentConfig(params.id, user, trx)
      if (!config) return { notFound: AGENT_CONFIG_NOT_FOUND }
      const rules = await rulesOf(config, trx)
      const rule = rules.find((item) => item.id === Number(params.ruleId))
      if (!rule) return { notFound: AGENT_RULE_NOT_FOUND }
      if (section !== undefined) {
        const refused = unknownSection(config, section)
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

    if ('notFound' in result) return response.notFound(result.notFound)
    if ('refused' in result) return response.unprocessableEntity(result.refused)
    return response.ok({
      rule: serializeAgentRule(result.rule),
      impact: await agentConfigImpact(result.config),
    })
  }

  async destroy({ params, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()

    const notFound = await db.transaction(async (trx) => {
      const config = await findOwnedAgentConfig(params.id, user, trx)
      if (!config) return AGENT_CONFIG_NOT_FOUND
      const rules = await rulesOf(config, trx)
      const rule = rules.find((item) => item.id === Number(params.ruleId))
      if (!rule) return AGENT_RULE_NOT_FOUND

      await rule.useTransaction(trx).delete()
      await renumber(
        rules.filter((item) => item.id !== rule.id),
        trx,
      )
      await bumpRevision(config, trx)
      return null
    })

    if (notFound) return response.notFound(notFound)
    return response.noContent()
  }
}
