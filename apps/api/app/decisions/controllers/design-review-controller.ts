import type { HttpContext } from '@adonisjs/core/http'
import { projectDesignFindings } from '#app/decisions/services/design-review'
import { findOwnedProject, PROJECT_NOT_FOUND } from '#app/projects/services/owned-project'
import {
  DESIGN_RECORDS_NOT_FOUND,
  designRecordsEnabled,
} from '#app/requirements/services/design-records-flag'

/**
 * What a project's requirements and decisions say against themselves. Read from the stored
 * records each time: nothing is kept and no model is called. Behind `design-records`.
 */
export default class DesignReviewController {
  /** `GET /projects/:id/design-review` */
  async show({ params, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await designRecordsEnabled(user))) return response.notFound(DESIGN_RECORDS_NOT_FOUND)
    const project = await findOwnedProject(params.id, user)
    if (!project) return response.notFound(PROJECT_NOT_FOUND)
    return response.ok({ findings: await projectDesignFindings(project.id) })
  }
}
