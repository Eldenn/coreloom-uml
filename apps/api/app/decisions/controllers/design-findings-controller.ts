import type { HttpContext } from '@adonisjs/core/http'
import {
  findOwnedDesignFinding,
  serializeDesignFinding,
} from '#app/decisions/services/model-design-review'
import { updateDesignFindingInput } from '#app/decisions/validators/decisions-input'
import {
  DESIGN_RECORDS_NOT_FOUND,
  designRecordsEnabled,
} from '#app/requirements/services/design-records-flag'

const FINDING_NOT_FOUND = { error: { message: 'Finding not found' } } as const

/** What the owner did with a finding of the model: done, dismissed, or open again. */
export default class DesignFindingsController {
  /** `PATCH /design-findings/:id` */
  async update({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await designRecordsEnabled(user))) return response.notFound(DESIGN_RECORDS_NOT_FOUND)
    const { resolution } = await request.validateUsing(updateDesignFindingInput)
    const finding = await findOwnedDesignFinding(params.id, user)
    if (!finding) return response.notFound(FINDING_NOT_FOUND)
    finding.resolution = resolution
    await finding.save()
    return response.ok({ finding: serializeDesignFinding(finding) })
  }
}
