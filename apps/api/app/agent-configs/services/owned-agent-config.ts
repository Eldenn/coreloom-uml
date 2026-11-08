import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import AgentConfig from '#app/agent-configs/models/agent-config'
import AgentConfigGeneration from '#app/agent-configs/models/agent-config-generation'
import { serializeAgentConfigDetail } from '#app/agent-configs/serializers/agent-config-serializer'
import { computeImpact, currentInputs } from '#app/agent-configs/services/agent-context'
import type Project from '#app/projects/models/project'
import { assertOwner } from '#app/shared/authorization/assert-owner'
import type User from '#app/users/models/user'

export const AGENT_CONFIG_NOT_FOUND = {
  error: { message: 'This project has no agent configuration' },
} as const
export const AGENT_RULE_NOT_FOUND = { error: { message: 'Rule not found' } } as const
export const AGENT_GENERATION_NOT_FOUND = { error: { message: 'Generation not found' } } as const

/**
 * The configuration of a project the caller owns (checked with `findOwnedProject` first), if it
 * has one and it is theirs; callers answer 404 otherwise.
 */
export async function findProjectAgentConfig(
  project: Project,
  user: User,
  client?: TransactionClientContract,
): Promise<AgentConfig | null> {
  const query = AgentConfig.query({ client }).where('projectId', project.id)
  if (client) query.forUpdate()
  const config = await query.first()
  if (!config || !assertOwner(config, user)) return null
  return config
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
export async function agentConfigImpact(config: AgentConfig, project: Project) {
  const inputs = await currentInputs(config, project)
  return computeImpact(config, inputs, await latestGeneration(config))
}

/** The body most endpoints answer with: the configuration in full and its impact. */
export async function describeAgentConfig(config: AgentConfig, project: Project) {
  const inputs = await currentInputs(config, project)
  const latest = await latestGeneration(config)
  return {
    config: serializeAgentConfigDetail(config, latest),
    impact: computeImpact(config, inputs, latest),
  }
}
