import type { HttpContext } from '@adonisjs/core/http'
import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import { migrateAnswers } from '@coreloom-uml/catalog'
import { LlmCallError, proposeRules } from '@coreloom-uml/llm'
import {
  currentInputs,
  render,
  resolveQuestionnaires,
} from '#app/agent-configs/services/agent-context'
import {
  AGENT_CONFIG_NOT_FOUND,
  findProjectAgentConfig,
} from '#app/agent-configs/services/owned-agent-config'
import LanguageModels, { llmFailure, providerProblem } from '#app/llm/services/language-models'
import { llmCallInput } from '#app/llm/validators/llm-input'
import type { AgentProposalsOutput } from '#app/llm/validators/llm-output'
import { SUBSCRIPTION_NOT_FOUND } from '#app/llm-connections/constants/llm-connections'
import { resolveCredential } from '#app/llm-connections/services/llm-credential'
import { findOwnedProject, PROJECT_NOT_FOUND } from '#app/projects/services/owned-project'

/**
 * `POST /projects/:id/agent-config/proposals`: the user's own model turns the notes under the
 * answers into proposed rules. Nothing is stored: the owner accepts a proposal (possibly edited)
 * with `POST …/rules` and `source: 'llm'`. Session only.
 *
 * The key (or the user's connected subscription) is read here, handed to the provider's client and
 * dropped. A provider failure answers
 * 502 with its reason only, never the provider's error; the configuration keeps working
 * without a model (manual rules, generations).
 */
export default class AgentConfigProposalsController {
  async store({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const project = await findOwnedProject(params.id, user)
    if (!project) return response.notFound(PROJECT_NOT_FOUND)
    const config = await findProjectAgentConfig(project, user)
    if (!config) return response.notFound(AGENT_CONFIG_NOT_FOUND)

    const { provider, apiKey } = await request.validateUsing(llmCallInput)
    const key = apiKey ?? ''
    const problem = providerProblem(provider, key)
    if (problem) return response.unprocessableEntity({ error: { message: problem } })
    const resolved = await resolveCredential(provider, key, user)
    if ('notFound' in resolved) return response.notFound(SUBSCRIPTION_NOT_FOUND)

    const log = { agentConfigId: config.id, kind: provider.kind, model: provider.model }
    if ('reason' in resolved) {
      logger.warn({ ...log, reason: resolved.reason }, 'agent rule proposals failed')
      return response.badGateway(llmFailure(resolved.reason))
    }

    const inputs = await currentInputs(config, project)
    const questionnaires = resolveQuestionnaires(inputs.questionnaires)
    let answers = inputs.answers
    for (const questionnaire of questionnaires) answers = migrateAnswers(questionnaire, answers)
    const details = new Map(
      config.answers.map((answer) => [
        `${answer.questionnaireId}/${answer.questionId}`,
        answer.details,
      ]),
    )

    const models = await app.container.make(LanguageModels)
    const started = performance.now()
    try {
      const result: AgentProposalsOutput = await proposeRules(
        models.create(provider, resolved.credential),
        {
          questionnaires,
          answers: answers.map((answer) => ({
            ...answer,
            details: details.get(`${answer.questionnaireId}/${answer.questionId}`) ?? null,
          })),
          rules: inputs.rules,
          fragments: render(inputs).fragments,
        },
      )
      logger.info(
        {
          ...log,
          durationMs: Math.round(performance.now() - started),
          proposals: result.proposals.length,
          truncated: result.truncated,
        },
        'agent rule proposals',
      )
      return response.ok(result)
    } catch (error) {
      if (!(error instanceof LlmCallError)) throw error
      logger.warn(
        { ...log, durationMs: Math.round(performance.now() - started), reason: error.reason },
        'agent rule proposals failed',
      )
      return response.badGateway(llmFailure(error.reason))
    }
  }
}
