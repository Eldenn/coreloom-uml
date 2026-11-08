import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { type AnswerValue, answerProblem, MARKER_PREFIX } from '@coreloom-uml/catalog'
import AgentConfigAnswer from '#app/agent-configs/models/agent-config-answer'
import { resolveQuestionnaires } from '#app/agent-configs/services/agent-context'
import {
  AGENT_CONFIG_NOT_FOUND,
  bumpRevision,
  describeAgentConfig,
  findProjectAgentConfig,
} from '#app/agent-configs/services/owned-agent-config'
import { updateAgentAnswersInput } from '#app/agent-configs/validators/agent-configs-input'
import { findOwnedProject, PROJECT_NOT_FOUND } from '#app/projects/services/owned-project'

type AnswerProblem = { questionnaireId: string; questionId: string; message: string }

/** The answers of a project's configuration. */
export default class AgentConfigAnswersController {
  /**
   * A partial update: each listed answer is set (or removed with `value: null`), the others are
   * left alone. Nothing is saved unless every answer fits its question; a 422 lists the others.
   */
  async update({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const project = await findOwnedProject(params.id, user)
    if (!project) return response.notFound(PROJECT_NOT_FOUND)
    const config = await findProjectAgentConfig(project, user)
    if (!config) return response.notFound(AGENT_CONFIG_NOT_FOUND)

    const { answers } = await request.validateUsing(updateAgentAnswersInput)
    const questionnaires = resolveQuestionnaires(config.questionnaires)

    const problems: AnswerProblem[] = []
    const seen = new Set<string>()
    for (const { questionnaireId, questionId, value } of answers) {
      const report = (message: string) => problems.push({ questionnaireId, questionId, message })
      const key = `${questionnaireId}/${questionId}`
      if (seen.has(key)) report('This question is answered twice')
      seen.add(key)
      const question = questionnaires
        .find((item) => item.id === questionnaireId)
        ?.questions.find((item) => item.id === questionId)
      if (!question) {
        report('Unknown question for this configuration')
        continue
      }
      if (value === undefined) {
        report('Expected a value, or null to remove the answer')
        continue
      }
      if (value === null) continue
      const problem = answerProblem(question, value as AnswerValue)
      if (problem) report(problem)
      else if (hasMarker(value as AnswerValue))
        report(`An answer cannot contain "${MARKER_PREFIX}"`)
    }
    if (problems.length > 0) {
      return response.unprocessableEntity({
        error: { message: 'Some answers do not fit their question.', problems },
      })
    }

    await db.transaction(async (trx) => {
      let changed = false
      for (const { questionnaireId, questionId, value, details } of answers) {
        const existing = await AgentConfigAnswer.query({ client: trx })
          .where('agentConfigId', config.id)
          .where('questionnaireId', questionnaireId)
          .where('questionId', questionId)
          .first()
        if (value === null) {
          if (existing) {
            await existing.useTransaction(trx).delete()
            changed = true
          }
          continue
        }
        const nextDetails = details === undefined ? (existing?.details ?? null) : details || null
        if (
          existing &&
          JSON.stringify(existing.value) === JSON.stringify(value) &&
          existing.details === nextDetails
        ) {
          continue
        }
        await AgentConfigAnswer.updateOrCreate(
          { agentConfigId: config.id, questionnaireId, questionId },
          { value: value as AnswerValue, details: nextDetails },
          { client: trx },
        )
        changed = true
      }
      if (changed) await bumpRevision(config, trx)
    })

    return response.ok(await describeAgentConfig(config, project))
  }
}

function hasMarker(value: AnswerValue): boolean {
  const texts = Array.isArray(value) ? value : [value]
  return texts.some((text) => typeof text === 'string' && text.includes(MARKER_PREFIX))
}
