import type { HttpContext } from '@adonisjs/core/http'
import CodeMap from '#app/code-maps/models/code-map'
import { deleteCodeMapFiles } from '#app/code-maps/services/code-map-storage'
import Project from '#app/projects/models/project'
import { serializeProject } from '#app/projects/serializers/project-serializer'
import { findOwnedProject, PROJECT_NOT_FOUND } from '#app/projects/services/owned-project'
import {
  createProjectInput,
  listProjectsInput,
  updateProjectInput,
} from '#app/projects/validators/projects-input'
import { likePattern } from '#app/shared/database/like-pattern'
import { paginate } from '#app/shared/pagination/paginate'

/** The signed-in user's projects: owner-scoped, a project that isn't yours reads as 404. */
export default class ProjectsController {
  async index({ request, auth, response }: HttpContext) {
    const { page, perPage, search } = await request.validateUsing(listProjectsInput)
    const user = auth.getUserOrFail()

    const query = Project.query()
      .where('userId', user.id)
      .withCount('architectures')
      .withCount('agentConfig', (query) => query.as('agent_configs_count'))
      .withCount('codeMaps', (query) => query.as('code_maps_count'))
      .orderBy('updatedAt', 'desc')
      .orderBy('id', 'desc')
    if (search) query.whereILike('name', likePattern(search))

    return response.ok(await paginate(query, { page, perPage }, serializeProject))
  }

  async store({ request, auth, response }: HttpContext) {
    const { name, description } = await request.validateUsing(createProjectInput)
    const user = auth.getUserOrFail()

    const project = await Project.create({
      userId: user.id,
      name,
      description: description ?? null,
    })

    return response.created({ project: serializeProject(project) })
  }

  async show({ params, auth, response }: HttpContext) {
    const project = await findOwnedProject(params.id, auth.getUserOrFail(), { withCounts: true })
    if (!project) return response.notFound(PROJECT_NOT_FOUND)

    return response.ok({ project: serializeProject(project) })
  }

  async update({ params, request, auth, response }: HttpContext) {
    const project = await findOwnedProject(params.id, auth.getUserOrFail(), { withCounts: true })
    if (!project) return response.notFound(PROJECT_NOT_FOUND)

    const { name, description } = await request.validateUsing(updateProjectInput)
    if (name !== undefined) project.name = name
    if (description !== undefined) project.description = description
    await project.save()

    return response.ok({ project: serializeProject(project) })
  }

  /**
   * Its architectures go with it (cascade), and with them their diagrams and share links; its
   * code maps too, whose files the cascade cannot reach.
   */
  async destroy({ params, auth, response }: HttpContext) {
    const project = await findOwnedProject(params.id, auth.getUserOrFail())
    if (!project) return response.notFound(PROJECT_NOT_FOUND)

    const codeMaps = await CodeMap.query().where('projectId', project.id).select('storageKey')
    await project.delete()
    await deleteCodeMapFiles(codeMaps.map((codeMap) => codeMap.storageKey))

    return response.noContent()
  }
}
