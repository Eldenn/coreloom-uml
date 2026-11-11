import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import AgentConfig from '#app/agent-configs/models/agent-config'
import AgentConfigGeneration from '#app/agent-configs/models/agent-config-generation'
import { serializeAgentConfigDetail } from '#app/agent-configs/serializers/agent-config-serializer'
import { listConfigDiagrams } from '#app/agent-configs/services/agent-config-diagrams'
import { computeImpact, currentInputs } from '#app/agent-configs/services/agent-context'
import { assertOwner } from '#app/shared/authorization/assert-owner'
import type User from '#app/users/models/user'

export const AGENT_CONFIG_NOT_FOUND = {
  error: { message: 'Agent configuration not found' },
} as const
export const PROJECT_HAS_AGENT_CONFIG = {
  error: { message: 'This project already has an agent configuration' },
} as const
export const AGENT_RULE_NOT_FOUND = { error: { message: 'Rule not found' } } as const
export const AGENT_GENERATION_NOT_FOUND = { error: { message: 'Generation not found' } } as const

/**
 * The configuration with this id if `user` owns it, else null — callers answer 404 either way.
 * Inside a transaction, the row is locked until it ends.
 */
export async function findOwnedAgentConfig(
  id: number,
  user: User,
  client?: TransactionClientContract,
): Promise<AgentConfig | null> {
  const query = AgentConfig.query({ client }).where('id', id)
  if (client) query.forUpdate()
  const config = await query.first()
  if (!config || !assertOwner(config, user)) return null
  return config
}

/** Whether another configuration than `exceptId` already sits in this project. */
export async function projectHasAgentConfig(
  projectId: number,
  exceptId?: number,
  client?: TransactionClientContract,
): Promise<boolean> {
  const query = AgentConfig.query({ client }).where('projectId', projectId)
  if (exceptId !== undefined) query.whereNot('id', exceptId)
  return (await query.first()) !== null
}

export function latestGeneration(config: AgentConfig): Promise<AgentConfigGeneration | null> {
  return AgentConfigGeneration.query()
    .where('agentConfigId', config.id)
    .orderBy('id', 'desc')
    .first()
}

/** Records a change to what the files are rendered from. */
export async function bumpRevision(config: AgentConfig, client: TransactionClientContract) {
  config.useTransaction(client)
  config.revision += 1
  await config.save()
}

/** What regenerating now would change; `null` before the first generation. */
export async function agentConfigImpact(config: AgentConfig) {
  const inputs = await currentInputs(config)
  return computeImpact(config, inputs, await latestGeneration(config))
}

/** The body most endpoints answer with: the configuration in full and its impact. */
export async function describeAgentConfig(config: AgentConfig) {
  const inputs = await currentInputs(config)
  const latest = await latestGeneration(config)
  return {
    config: serializeAgentConfigDetail(config, latest, await listConfigDiagrams(config)),
    impact: computeImpact(config, inputs, latest),
  }
}
