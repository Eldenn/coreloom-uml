import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { migrateAnswers, ruleSections } from '@coreloom-uml/catalog'
import {
  type ArchitectureDiagram,
  LlmCallError,
  proposeArchitectureRules,
  proposeRules,
} from '@coreloom-uml/llm'
import { AgentProposalSource } from '#app/agent-configs/constants/agent-config'
import type AgentConfig from '#app/agent-configs/models/agent-config'
import {
  currentInputs,
  render,
  resolveQuestionnaires,
} from '#app/agent-configs/services/agent-context'
import {
  AGENT_CONFIG_NOT_FOUND,
  findProjectAgentConfig,
} from '#app/agent-configs/services/owned-agent-config'
import { readProjectDiagrams } from '#app/agent-configs/services/project-diagrams'
import { agentProposalsInput } from '#app/agent-configs/validators/agent-configs-input'
import { DIAGRAM_NOT_FOUND } from '#app/diagrams/services/owned-diagram'
import { llmFailure, userLanguageModel } from '#app/llm/services/language-models'
import type { AgentProposalsOutput } from '#app/llm/validators/llm-output'
import { SUBSCRIPTION_NOT_FOUND } from '#app/llm-connections/constants/llm-connections'
import type Project from '#app/projects/models/project'
import { findOwnedProject, PROJECT_NOT_FOUND } from '#app/projects/services/owned-project'

/**
 * `POST /projects/:id/agent-config/proposals`: the user's own model turns the notes under the
 * answers (`from: 'answers'`, the default) or the project's diagrams (`from: 'diagrams'`, sent as
 * PlantUML without their layout) into proposed rules. Nothing is stored: the owner accepts a proposal (possibly edited)
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

    const { provider, apiKey, from, diagramIds } = await request.validateUsing(agentProposalsInput)
    const diagrams =
      from === AgentProposalSource.Diagrams ? await readProjectDiagrams(project, diagramIds) : null
    if (diagrams === 'notFound') return response.notFound(DIAGRAM_NOT_FOUND)

    const built = await userLanguageModel(provider, apiKey, user)
    if ('problem' in built)
      return response.unprocessableEntity({ error: { message: built.problem } })
    if ('notFound' in built) return response.notFound(SUBSCRIPTION_NOT_FOUND)

    const log = {
      agentConfigId: config.id,
      kind: provider.kind,
      model: provider.model,
      from: from ?? AgentProposalSource.Answers,
    }
    if ('reason' in built) {
      logger.warn({ ...log, reason: built.reason }, 'agent rule proposals failed')
      return response.badGateway(llmFailure(built.reason))
    }
    const { model } = built
    const started = performance.now()
    try {
      const result: AgentProposalsOutput = diagrams
        ? await proposeArchitectureRules(model, await architectureSource(config, project, diagrams))
        : { ...(await proposeRules(model, await answersSource(config, project))), skipped: [] }
      logger.info(
        {
          ...log,
          durationMs: Math.round(performance.now() - started),
          proposals: result.proposals.length,
          truncated: result.truncated,
          skipped: result.skipped.length,
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

/** The configuration's answers with their notes, migrated to the current questionnaires. */
async function answersSource(config: AgentConfig, project: Project) {
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
  return {
    questionnaires,
    answers: answers.map((answer) => ({
      ...answer,
      details: details.get(`${answer.questionnaireId}/${answer.questionId}`) ?? null,
    })),
    rules: inputs.rules,
    fragments: render(inputs).fragments,
  }
}

/** What is already in the file, and the sections a rule may go to. */
async function architectureSource(
  config: AgentConfig,
  project: Project,
  diagrams: ArchitectureDiagram[],
) {
  const inputs = await currentInputs(config, project)
  return {
    diagrams,
    sections: ruleSections(resolveQuestionnaires(inputs.questionnaires)),
    existing: [...render(inputs).fragments, ...inputs.rules],
  }
}
