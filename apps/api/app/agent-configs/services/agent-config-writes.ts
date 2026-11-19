import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type AgentConfig from '#app/agent-configs/models/agent-config'

/**
 * Deletes owned agent conventions: their ready-made rules, rules, roles and generations go with
 * them. The one code path of `DELETE /agent-configs/:id` and `delete_agent_config`.
 */
export async function deleteAgentConfig(config: AgentConfig, client?: TransactionClientContract) {
  if (client) config.useTransaction(client)
  await config.delete()
}
