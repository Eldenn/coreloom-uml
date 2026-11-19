import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { CodeReviewResolution } from '#app/code-reviews/constants/code-review'
import type CodeReview from '#app/code-reviews/models/code-review'
import type CodeReviewFinding from '#app/code-reviews/models/code-review-finding'

/** `PATCH /code-review-findings/:id`, in `client` when given. */
export async function resolveFinding(
  finding: CodeReviewFinding,
  resolution: CodeReviewResolution,
  client?: TransactionClientContract,
): Promise<void> {
  if (client) finding.useTransaction(client)
  finding.resolution = resolution
  await finding.save()
}

/** `DELETE /code-reviews/:id`, with its findings (cascade), in `client` when given. */
export async function deleteCodeReview(
  review: CodeReview,
  client?: TransactionClientContract,
): Promise<void> {
  if (client) review.useTransaction(client)
  await review.delete()
}
