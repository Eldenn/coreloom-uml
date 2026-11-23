import type { HttpContext } from '@adonisjs/core/http'
import Decision from '#app/decisions/models/decision'
import { serializeDecision } from '#app/decisions/serializers/decision-serializer'
import {
  createDecision,
  DECISION_NOT_FOUND,
  DECISIONS_FULL,
  findOwnedDecision,
  updateDecision,
  withLinks,
} from '#app/decisions/services/decision-writes'
import {
  createDecisionInput,
  listDecisionsInput,
  updateDecisionInput,
} from '#app/decisions/validators/decisions-input'
import { findOwnedProject, PROJECT_NOT_FOUND } from '#app/projects/services/owned-project'
import {
  DESIGN_RECORDS_NOT_FOUND,
  designRecordsEnabled,
} from '#app/requirements/services/design-records-flag'
import { paginate } from '#app/shared/pagination/paginate'

/**
 * A project's architecture decisions. Owner-scoped, behind the `design-records` flag (404 while
 * off).
 */
export default class DecisionsController {
  /** `GET /projects/:id/decisions`, newest first. */
  async index({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await designRecordsEnabled(user))) return response.notFound(DESIGN_RECORDS_NOT_FOUND)
    const { page, perPage } = await request.validateUsing(listDecisionsInput)
    const project = await findOwnedProject(params.id, user)
    if (!project) return response.notFound(PROJECT_NOT_FOUND)

    const query = withLinks(Decision.query().where('projectId', project.id).orderBy('id', 'desc'))
    return response.ok(await paginate(query, { page, perPage }, serializeDecision))
  }

  /** `POST /projects/:id/decisions` */
  async store({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await designRecordsEnabled(user))) return response.notFound(DESIGN_RECORDS_NOT_FOUND)
    const fields = await request.validateUsing(createDecisionInput)
    const project = await findOwnedProject(params.id, user)
    if (!project) return response.notFound(PROJECT_NOT_FOUND)

    const decision = await createDecision(project, fields)
    if (decision === 'full') return response.conflict(DECISIONS_FULL)
    if ('refused' in decision) return response.unprocessableEntity(decision.refused)
    return response.created({ decision: serializeDecision(decision) })
  }

  /** `PATCH /decisions/:id` */
  async update({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await designRecordsEnabled(user))) return response.notFound(DESIGN_RECORDS_NOT_FOUND)
    const found = await findOwnedDecision(params.id, user)
    if (!found) return response.notFound(DECISION_NOT_FOUND)

    const decision = await updateDecision(found, await request.validateUsing(updateDecisionInput))
    if ('refused' in decision) return response.unprocessableEntity(decision.refused)
    return response.ok({ decision: serializeDecision(decision) })
  }

  /** `DELETE /decisions/:id`: a decision it replaced stays superseded, by none. */
  async destroy({ params, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await designRecordsEnabled(user))) return response.notFound(DESIGN_RECORDS_NOT_FOUND)
    const decision = await findOwnedDecision(params.id, user)
    if (!decision) return response.notFound(DECISION_NOT_FOUND)

    await decision.delete()
    return response.noContent()
  }
}
