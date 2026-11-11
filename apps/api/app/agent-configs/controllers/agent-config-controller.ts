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
import { serializeAgentConfig } from '#app/agent-configs/serializers/agent-config-serializer'
import {
  AGENT_CONFIG_NOT_FOUND,
  describeAgentConfig,
  findOwnedAgentConfig,
  PROJECT_HAS_AGENT_CONFIG,
  projectHasAgentConfig,
} from '#app/agent-configs/services/owned-agent-config'
import {
  createAgentConfigInput,
  listAgentConfigsInput,
  updateAgentConfigInput,
} from '#app/agent-configs/validators/agent-configs-input'
import Project from '#app/projects/models/project'
import { findOwnedProject, PROJECT_NOT_FOUND } from '#app/projects/services/owned-project'
import { likePattern } from '#app/shared/database/like-pattern'
import { paginate } from '#app/shared/pagination/paginate'

/**
 * Agent conventions: owner-scoped configurations, each in one of the owner's projects (at most
 * one per project) or outside any.
 */
export default class AgentConfigController {
  async index({ request, auth, response }: HttpContext) {
    const { page, perPage, projectId, search } = await request.validateUsing(listAgentConfigsInput)
    const user = auth.getUserOrFail()

    const query = AgentConfig.query()
      .where('userId', user.id)
      .orderBy('updatedAt', 'desc')
      .orderBy('id', 'desc')
    if (projectId) query.where('projectId', projectId)
    if (search) query.whereILike('name', likePattern(search))

    return response.ok(await paginate(query, { page, perPage }, serializeAgentConfig))
  }

  /** Each questionnaire is taken at its current catalog version. */
  async store({ request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const input = await request.validateUsing(createAgentConfigInput)

    const project = input.projectId ? await findOwnedProject(input.projectId, user) : null
    if (input.projectId && !project) return response.notFound(PROJECT_NOT_FOUND)
    const composed = composeInput(input.questionnaires)
    if ('refused' in composed) return response.unprocessableEntity(composed.refused)

    const config = await db.transaction(async (trx) => {
      if (project && (await lockProjectHasConfig(project.id, undefined, trx))) return null
      return AgentConfig.create(
        {
          userId: user.id,
          projectId: project?.id ?? null,
          name: input.name,
          questionnaires: composed.questionnaires.map(({ id, version }) => ({ id, version })),
          targets: input.targets,
          notes: cleanNotes(input.notes) ?? null,
          revision: 1,
        },
        { client: trx },
      )
    })
    if (!config) return response.conflict(PROJECT_HAS_AGENT_CONFIG)

    return response.created(await describeAgentConfig(config))
  }

  async show({ params, auth, response }: HttpContext) {
    const config = await findOwnedAgentConfig(params.id, auth.getUserOrFail())
    if (!config) return response.notFound(AGENT_CONFIG_NOT_FOUND)

    return response.ok(await describeAgentConfig(config))
  }

  /**
   * Omitted fields are left as is. Questionnaires are taken at their current catalog version:
   * answers saved against an older one go through its migrations, and answers to a
   * questionnaire no longer listed are removed. `projectId` moves it (409 when that project
   * already holds a configuration), null takes it out of its project.
   */
  async update({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const input = await request.validateUsing(updateAgentConfigInput)

    const composed = input.questionnaires ? composeInput(input.questionnaires) : null
    if (composed && 'refused' in composed) return response.unprocessableEntity(composed.refused)
    if (input.projectId && !(await findOwnedProject(input.projectId, user)))
      return response.notFound(PROJECT_NOT_FOUND)
    const notes = cleanNotes(input.notes)

    const result = await db.transaction(async (trx) => {
      const config = await findOwnedAgentConfig(params.id, user, trx)
      if (!config) return { notFound: true as const }
      config.useTransaction(trx)

      if (input.projectId !== undefined && input.projectId !== config.projectId) {
        if (
          input.projectId !== null &&
          (await lockProjectHasConfig(input.projectId, config.id, trx))
        )
          return { conflict: true as const }
        config.projectId = input.projectId
      }
      if (input.name !== undefined) config.name = input.name

      const questionnaires = composed
        ? composed.questionnaires.map(({ id, version }) => ({ id, version }))
        : config.questionnaires
      const targets = input.targets ?? config.targets
      const changed =
        JSON.stringify(config.questionnaires) !== JSON.stringify(questionnaires) ||
        JSON.stringify(config.targets) !== JSON.stringify(targets) ||
        (notes !== undefined && notes !== config.notes)
      if (changed) {
        if (composed) await syncAnswers(config, composed.questionnaires, trx)
        config.questionnaires = questionnaires
        config.targets = targets
        if (notes !== undefined) config.notes = notes
        config.revision += 1
      }
      await config.save()
      return { config }
    })

    if ('notFound' in result) return response.notFound(AGENT_CONFIG_NOT_FOUND)
    if ('conflict' in result) return response.conflict(PROJECT_HAS_AGENT_CONFIG)
    return response.ok(await describeAgentConfig(result.config))
  }

  /** Its answers, rules and generations go with it. */
  async destroy({ params, auth, response }: HttpContext) {
    const config = await findOwnedAgentConfig(params.id, auth.getUserOrFail())
    if (!config) return response.notFound(AGENT_CONFIG_NOT_FOUND)

    await config.delete()

    return response.noContent()
  }
}

/**
 * Locks the project row until the transaction ends, so two requests cannot both find it empty,
 * then tells whether another configuration than `exceptId` already sits in it.
 */
async function lockProjectHasConfig(
  projectId: number,
  exceptId: number | undefined,
  trx: TransactionClientContract,
) {
  await Project.query({ client: trx }).where('id', projectId).forUpdate()
  return projectHasAgentConfig(projectId, exceptId, trx)
}

/** Blank notes are stored as none; omitted notes stay omitted. */
function cleanNotes(notes: string | null | undefined) {
  return notes === undefined ? undefined : notes?.trim() ? notes : null
}

/** The questionnaires at their current catalog version, or why they cannot be used together. */
function composeInput(ids: string[]) {
  const unknown = ids.filter((id) => !findQuestionnaire(id))
  if (unknown.length > 0) {
    return { refused: { error: { message: `Unknown questionnaire: ${unknown.join(', ')}` } } }
  }
  const composition = composeQuestionnaires(ids.map((id) => findQuestionnaire(id) as Questionnaire))
  if (!composition.ok) {
    return {
      refused: {
        error: {
          message: 'These questionnaires cannot be combined.',
          problems: composition.problems,
        },
      },
    }
  }
  return { questionnaires: composition.questionnaires }
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
