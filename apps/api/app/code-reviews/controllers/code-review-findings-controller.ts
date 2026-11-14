import type { HttpContext } from '@adonisjs/core/http'
import { CODE_MAPS_NOT_FOUND, codeMapsEnabled } from '#app/code-maps/services/code-maps-flag'
import CodeReviewFinding from '#app/code-reviews/models/code-review-finding'
import { serializeCodeReviewFinding } from '#app/code-reviews/serializers/code-review-serializer'
import { findOwnedCodeReview } from '#app/code-reviews/services/owned-code-review'
import { updateCodeReviewFindingInput } from '#app/code-reviews/validators/code-reviews-input'
import type { CodeReviewFindingUpdateOutput } from '#app/code-reviews/validators/code-reviews-output'

const FINDING_NOT_FOUND = { error: { message: 'Finding not found' } } as const

/** What the owner did with a finding: done, dismissed, or open again. */
export default class CodeReviewFindingsController {
  /** `PATCH /code-review-findings/:id` */
  async update({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await codeMapsEnabled(user))) return response.notFound(CODE_MAPS_NOT_FOUND)
    const { resolution } = await request.validateUsing(updateCodeReviewFindingInput)
    const finding = await CodeReviewFinding.find(params.id)
    if (!finding || !(await findOwnedCodeReview(finding.codeReviewId, user))) {
      return response.notFound(FINDING_NOT_FOUND)
    }
    finding.resolution = resolution
    await finding.save()
    return response.ok({
      finding: serializeCodeReviewFinding(finding),
    } satisfies CodeReviewFindingUpdateOutput)
  }
}
