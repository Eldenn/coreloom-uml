import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { RULE_PACKS, ruleSections } from '@coreloom-uml/catalog'
import { importAgentFile, LlmCallError } from '@coreloom-uml/llm'
import { currentInputs, render } from '#app/agent-configs/services/agent-context'
import {
  AGENT_CONFIG_NOT_FOUND,
  findOwnedAgentConfig,
} from '#app/agent-configs/services/owned-agent-config'
import { agentImportInput } from '#app/agent-configs/validators/agent-configs-input'
import type { AgentImportOutput } from '#app/agent-configs/validators/agent-configs-output'
import { llmFailure, userLanguageModel } from '#app/llm/services/language-models'
import { SUBSCRIPTION_NOT_FOUND } from '#app/llm-connections/constants/llm-connections'

/**
 * `POST /agent-configs/:id/imports`: the user's own model reads an existing conventions
 * file (AGENTS.md, CLAUDE.md…) and proposes the catalog's ready-made rules it states, and rules
 * for the rest. Nothing is stored: the owner accepts the ready-made rules they keep with
 * `PUT …/ready-rules/:slot` and the others with `POST …/rules`. The file is never logged, only
 * counts. Session only. With `origin: 'research'` the text is the findings of a web research
 * (`POST …/research`): the model is told so, and nothing else changes.
 */
export default class AgentConfigImportsController {
  async store({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const config = await findOwnedAgentConfig(params.id, user)
    if (!config) return response.notFound(AGENT_CONFIG_NOT_FOUND)

    const { provider, apiKey, content, origin } = await request.validateUsing(agentImportInput)
    const built = await userLanguageModel(provider, apiKey, user)
    if ('problem' in built)
      return response.unprocessableEntity({ error: { message: built.problem } })
    if ('notFound' in built) return response.notFound(SUBSCRIPTION_NOT_FOUND)

    const log = { agentConfigId: config.id, kind: provider.kind, model: provider.model }
    if ('reason' in built) {
      logger.warn({ ...log, reason: built.reason }, 'agent file import failed')
      return response.badGateway(llmFailure(built.reason))
    }

    const inputs = await currentInputs(config)

    const started = performance.now()
    try {
      const result: AgentImportOutput = await importAgentFile(built.model, {
        packs: RULE_PACKS,
        ready: inputs.ready,
        sections: ruleSections(RULE_PACKS),
        existing: [...render(inputs).fragments, ...inputs.rules],
        content,
        origin,
      })
      logger.info(
        {
          ...log,
          durationMs: Math.round(performance.now() - started),
          length: content.length,
          ready: result.ready.length,
          rules: result.rules.length,
          truncated: result.truncated,
        },
        'agent file import',
      )
      return response.ok(result)
    } catch (error) {
      if (!(error instanceof LlmCallError)) throw error
      logger.warn(
        { ...log, durationMs: Math.round(performance.now() - started), reason: error.reason },
        'agent file import failed',
      )
      return response.badGateway(llmFailure(error.reason))
    }
  }
}
