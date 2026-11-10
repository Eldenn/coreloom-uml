import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { migrateAnswers, ruleSections } from '@coreloom-uml/catalog'
import { importAgentFile, LlmCallError } from '@coreloom-uml/llm'
import {
  currentInputs,
  render,
  resolveQuestionnaires,
} from '#app/agent-configs/services/agent-context'
import {
  AGENT_CONFIG_NOT_FOUND,
  findProjectAgentConfig,
} from '#app/agent-configs/services/owned-agent-config'
import { agentImportInput } from '#app/agent-configs/validators/agent-configs-input'
import type { AgentImportOutput } from '#app/agent-configs/validators/agent-configs-output'
import { llmFailure, userLanguageModel } from '#app/llm/services/language-models'
import { SUBSCRIPTION_NOT_FOUND } from '#app/llm-connections/constants/llm-connections'
import { findOwnedProject, PROJECT_NOT_FOUND } from '#app/projects/services/owned-project'

/**
 * `POST /projects/:id/agent-config/imports`: the user's own model reads an existing conventions
 * file (AGENTS.md, CLAUDE.md…) and proposes answers to the configured questionnaires and rules
 * for the rest. Nothing is stored: the owner applies the answers they keep with `PUT …/answers`
 * and accepts rules with `POST …/rules`. The file is never logged, only counts. Session only.
 */
export default class AgentConfigImportsController {
  async store({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const project = await findOwnedProject(params.id, user)
    if (!project) return response.notFound(PROJECT_NOT_FOUND)
    const config = await findProjectAgentConfig(project, user)
    if (!config) return response.notFound(AGENT_CONFIG_NOT_FOUND)

    const { provider, apiKey, content } = await request.validateUsing(agentImportInput)
    const built = await userLanguageModel(provider, apiKey, user)
    if ('problem' in built)
      return response.unprocessableEntity({ error: { message: built.problem } })
    if ('notFound' in built) return response.notFound(SUBSCRIPTION_NOT_FOUND)

    const log = { agentConfigId: config.id, kind: provider.kind, model: provider.model }
    if ('reason' in built) {
      logger.warn({ ...log, reason: built.reason }, 'agent file import failed')
      return response.badGateway(llmFailure(built.reason))
    }

    const inputs = await currentInputs(config, project)
    const questionnaires = resolveQuestionnaires(inputs.questionnaires)
    let answers = inputs.answers
    for (const questionnaire of questionnaires) answers = migrateAnswers(questionnaire, answers)

    const started = performance.now()
    try {
      const result: AgentImportOutput = await importAgentFile(built.model, {
        questionnaires,
        answers,
        sections: ruleSections(questionnaires),
        existing: [...render(inputs).fragments, ...inputs.rules],
        content,
      })
      logger.info(
        {
          ...log,
          durationMs: Math.round(performance.now() - started),
          length: content.length,
          answers: result.answers.length,
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
