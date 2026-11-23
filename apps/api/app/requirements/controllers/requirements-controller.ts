import type { HttpContext } from '@adonisjs/core/http'
import { findOwnedProject, PROJECT_NOT_FOUND } from '#app/projects/services/owned-project'
import Requirement from '#app/requirements/models/requirement'
import { serializeRequirement } from '#app/requirements/serializers/requirement-serializer'
import {
  DESIGN_RECORDS_NOT_FOUND,
  designRecordsEnabled,
} from '#app/requirements/services/design-records-flag'
import {
  createRequirement,
  findOwnedRequirement,
  REQUIREMENT_NOT_FOUND,
  REQUIREMENTS_FULL,
  updateRequirement,
} from '#app/requirements/services/requirement-writes'
import {
  createRequirementInput,
  listRequirementsInput,
  updateRequirementInput,
} from '#app/requirements/validators/requirements-input'
import { paginate } from '#app/shared/pagination/paginate'

/**
 * What a project's architecture has to hold. Owner-scoped, behind the `design-records` flag (404
 * while off).
 */
export default class RequirementsController {
  /** `GET /projects/:id/requirements`: the ones that must hold first, then the oldest first. */
  async index({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await designRecordsEnabled(user))) return response.notFound(DESIGN_RECORDS_NOT_FOUND)
    const { page, perPage } = await request.validateUsing(listRequirementsInput)
    const project = await findOwnedProject(params.id, user)
    if (!project) return response.notFound(PROJECT_NOT_FOUND)

    const query = Requirement.query()
      .where('projectId', project.id)
      .orderBy('priority', 'asc')
      .orderBy('id', 'asc')
    return response.ok(await paginate(query, { page, perPage }, serializeRequirement))
  }

  /** `POST /projects/:id/requirements` */
  async store({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await designRecordsEnabled(user))) return response.notFound(DESIGN_RECORDS_NOT_FOUND)
    const fields = await request.validateUsing(createRequirementInput)
    const project = await findOwnedProject(params.id, user)
    if (!project) return response.notFound(PROJECT_NOT_FOUND)

    const requirement = await createRequirement(project, fields)
    if (requirement === 'full') return response.conflict(REQUIREMENTS_FULL)
    return response.created({ requirement: serializeRequirement(requirement) })
  }

  /** `PATCH /requirements/:id` */
  async update({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await designRecordsEnabled(user))) return response.notFound(DESIGN_RECORDS_NOT_FOUND)
    const requirement = await findOwnedRequirement(params.id, user)
    if (!requirement) return response.notFound(REQUIREMENT_NOT_FOUND)

    await updateRequirement(requirement, await request.validateUsing(updateRequirementInput))
    return response.ok({ requirement: serializeRequirement(requirement) })
  }

  /** `DELETE /requirements/:id`: the decisions that named it stay, without the link. */
  async destroy({ params, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await designRecordsEnabled(user))) return response.notFound(DESIGN_RECORDS_NOT_FOUND)
    const requirement = await findOwnedRequirement(params.id, user)
    if (!requirement) return response.notFound(REQUIREMENT_NOT_FOUND)

    await requirement.delete()
    return response.noContent()
  }
}
