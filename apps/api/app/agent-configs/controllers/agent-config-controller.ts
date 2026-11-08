import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import {
  composeQuestionnaires,
  findQuestionnaire,
  migrateAnswers,
  type Questionnaire,
} from '@coreloom-uml/catalog'
import AgentConfig, { type AgentConfigQuestionnaire } from '#app/agent-configs/models/agent-config'
import AgentConfigAnswer from '#app/agent-configs/models/agent-config-answer'
import {
  AGENT_CONFIG_NOT_FOUND,
  describeAgentConfig,
  findProjectAgentConfig,
} from '#app/agent-configs/services/owned-agent-config'
import { upsertAgentConfigInput } from '#app/agent-configs/validators/agent-configs-input'
import { findOwnedProject, PROJECT_NOT_FOUND } from '#app/projects/services/owned-project'

/** A project's agent conventions: one configuration per project. */
export default class AgentConfigController {
  async show({ params, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const project = await findOwnedProject(params.id, user)
    if (!project) return response.notFound(PROJECT_NOT_FOUND)
    const config = await findProjectAgentConfig(project, user)
    if (!config) return response.notFound(AGENT_CONFIG_NOT_FOUND)

    return response.ok(await describeAgentConfig(config, project))
  }

  /**
   * Creates the configuration (201) or replaces its questionnaires, targets and notes (200).
   * Each questionnaire is taken at its current catalog version: answers saved against an older
   * one go through its migrations, and answers to a questionnaire no longer listed are removed.
   */
  async update({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const project = await findOwnedProject(params.id, user)
    if (!project) return response.notFound(PROJECT_NOT_FOUND)

    const input = await request.validateUsing(upsertAgentConfigInput)
    const unknown = input.questionnaires.filter((id) => !findQuestionnaire(id))
    if (unknown.length > 0) {
      return response.unprocessableEntity({
        error: { message: `Unknown questionnaire: ${unknown.join(', ')}` },
      })
    }
    const composition = composeQuestionnaires(
      input.questionnaires.map((id) => findQuestionnaire(id) as Questionnaire),
    )
    if (!composition.ok) {
      return response.unprocessableEntity({
        error: {
          message: 'These questionnaires cannot be combined.',
          problems: composition.problems,
        },
      })
    }
    const questionnaires = composition.questionnaires.map(({ id, version }) => ({ id, version }))
    const notes = input.notes === undefined ? undefined : input.notes?.trim() ? input.notes : null

    const { config, created } = await db.transaction(async (trx) => {
      const existing = await findProjectAgentConfig(project, user, trx)
      if (!existing) {
        const config = await AgentConfig.create(
          {
            userId: user.id,
            projectId: project.id,
            questionnaires,
            targets: input.targets,
            notes: notes ?? null,
            revision: 1,
          },
          { client: trx },
        )
        return { config, created: true }
      }

      const changed =
        JSON.stringify(existing.questionnaires) !== JSON.stringify(questionnaires) ||
        JSON.stringify(existing.targets) !== JSON.stringify(input.targets) ||
        (notes !== undefined && notes !== existing.notes)
      if (changed) {
        await syncAnswers(existing, composition.questionnaires, trx)
        existing.useTransaction(trx)
        existing.questionnaires = questionnaires
        existing.targets = input.targets
        if (notes !== undefined) existing.notes = notes
        existing.revision += 1
        await existing.save()
      }
      return { config: existing, created: false }
    })

    const body = await describeAgentConfig(config, project)
    return created ? response.created(body) : response.ok(body)
  }

  /** Its answers, rules and generations go with it. */
  async destroy({ params, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const project = await findOwnedProject(params.id, user)
    if (!project) return response.notFound(PROJECT_NOT_FOUND)
    const config = await findProjectAgentConfig(project, user)
    if (!config) return response.notFound(AGENT_CONFIG_NOT_FOUND)

    await config.delete()

    return response.noContent()
  }
}

/**
 * Brings the stored answers in line with the new list of questionnaires: answers to a dropped
 * questionnaire are removed, and answers to one whose version changed go through its migrations.
 */
async function syncAnswers(
  config: AgentConfig,
  questionnaires: Questionnaire[],
  trx: TransactionClientContract,
) {
  const kept = new Map(questionnaires.map((item) => [item.id, item]))
  const before = new Map<string, AgentConfigQuestionnaire>(
    config.questionnaires.map((item) => [item.id, item]),
  )
  const answers = await AgentConfigAnswer.query({ client: trx }).where('agentConfigId', config.id)

  for (const answer of answers) {
    const questionnaire = kept.get(answer.questionnaireId)
    if (!questionnaire) {
      await answer.useTransaction(trx).delete()
      continue
    }
    if (before.get(questionnaire.id)?.version === questionnaire.version) continue
    const [migrated] = migrateAnswers(questionnaire, [answer])
    if (!migrated) {
      await answer.useTransaction(trx).delete()
    } else if (JSON.stringify(migrated.value) !== JSON.stringify(answer.value)) {
      answer.useTransaction(trx)
      answer.value = migrated.value
      await answer.save()
    }
  }
}
