import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { RULE_PACKS, ruleSections } from '@coreloom-uml/catalog'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import { ImportOrigin, importAgentFile, LlmCallError } from '@coreloom-uml/llm'
import { currentInputs, render } from '#app/agent-configs/services/agent-context'
import {
  AGENT_CONFIG_NOT_FOUND,
  findOwnedAgentConfig,
} from '#app/agent-configs/services/owned-agent-config'
import { agentImportInput } from '#app/agent-configs/validators/agent-configs-input'
import type { AgentImportOutput } from '#app/agent-configs/validators/agent-configs-output'
import { ProposalsStatus } from '#app/assistant/constants/assistant'
import type AssistantConversation from '#app/assistant/models/assistant-conversation'
import { serializeMessage } from '#app/assistant/serializers/assistant-serializer'
import { ASSISTANT_NOT_FOUND, assistantEnabled } from '#app/assistant/services/assistant-flag'
import {
  CONVERSATION_NOT_FOUND,
  findOwnedConversation,
} from '#app/assistant/services/owned-conversation'
import { storeExchange } from '#app/assistant/services/store-exchange'
import { isFeatureEnabled } from '#app/feature-flags/services/feature-flags'
import { llmFailure, userLanguageModel } from '#app/llm/services/language-models'
import { SUBSCRIPTION_NOT_FOUND } from '#app/llm-connections/constants/llm-connections'

const CONVERSATION_NEEDS_RESEARCH = {
  error: { message: 'A conversation is only accepted with the proposals of a web research.' },
} as const

/**
 * `POST /agent-configs/:id/imports`: the user's own model reads an existing conventions
 * file (AGENTS.md, CLAUDE.md…) and proposes the catalog's ready-made rules it states, and rules
 * for the rest. Nothing is stored: the owner accepts the ready-made rules they keep with
 * `PUT …/ready-rules/:slot` and the others with `POST …/rules`. The file is never logged, only
 * counts. Session only. With `origin: 'research'` the text is the findings of a web research
 * (`POST …/research`): the model is told so, and nothing else changes.
 *
 * With `conversation` too (behind `diagram-assistant`), the research was asked in that assistant
 * conversation: once the model answered, the request and the proposals (rules and the addresses
 * of the pages read, never the findings) are stored there, for the owner to add.
 */
export default class AgentConfigImportsController {
  async store({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const config = await findOwnedAgentConfig(params.id, user)
    if (!config) return response.notFound(AGENT_CONFIG_NOT_FOUND)

    const { provider, content, origin, conversation } =
      await request.validateUsing(agentImportInput)
    // Checked before any model call: a foreign conversation costs the caller nothing.
    let target: AssistantConversation | null = null
    if (conversation) {
      if (origin !== ImportOrigin.Research)
        return response.unprocessableEntity(CONVERSATION_NEEDS_RESEARCH)
      // The findings of a research, kept by the assistant: both features have to be on.
      if (
        !(await assistantEnabled(user)) ||
        !(await isFeatureEnabled(FeatureFlagKey.WebResearch, user))
      )
        return response.notFound(ASSISTANT_NOT_FOUND)
      target = await findOwnedConversation(conversation.id, user)
      if (!target) return response.notFound(CONVERSATION_NOT_FOUND)
    }
    const built = await userLanguageModel(provider, user)
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
      if (!conversation || !target) return response.ok(result)
      const messages = await storeExchange(target, conversation.request, {
        architectureId: null,
        content: '',
        proposals: {
          agentConfigId: config.id,
          sources: conversation.sources,
          // Without its evidence, which quotes the findings: those are never kept.
          ready: result.ready.map(({ evidence: _evidence, ...rule }) => rule),
          rules: result.rules,
          truncated: result.truncated,
          status: ProposalsStatus.Pending,
          added: null,
        },
      })
      return response.ok({ ...result, messages: messages.map(serializeMessage) })
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
