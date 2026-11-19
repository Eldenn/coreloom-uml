import type { HttpContext } from '@adonisjs/core/http'
import { CODE_MAPS_NOT_FOUND, codeMapsEnabled } from '#app/code-maps/services/code-maps-flag'
import { serializeCodeReviewFinding } from '#app/code-reviews/serializers/code-review-serializer'
import { resolveFinding } from '#app/code-reviews/services/code-review-writes'
import { findOwnedFinding } from '#app/code-reviews/services/owned-code-review'
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
    const finding = await findOwnedFinding(params.id, user)
    if (!finding) return response.notFound(FINDING_NOT_FOUND)
    await resolveFinding(finding, resolution)
    return response.ok({
      finding: serializeCodeReviewFinding(finding),
    } satisfies CodeReviewFindingUpdateOutput)
  }
}
