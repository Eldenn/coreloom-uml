import db from '@adonisjs/lucid/services/db'
import { CodeReviewResolution } from '#app/code-reviews/constants/code-review'
import CodeReview from '#app/code-reviews/models/code-review'
import CodeReviewFinding from '#app/code-reviews/models/code-review-finding'
import { serializeCodeReview } from '#app/code-reviews/serializers/code-review-serializer'
import type { CodeReviewOutput } from '#app/code-reviews/validators/code-reviews-output'
import { assertOwner } from '#app/shared/authorization/assert-owner'
import type User from '#app/users/models/user'

export const CODE_REVIEW_NOT_FOUND = { error: { message: 'Code review not found' } } as const

/** The review with this id if `user` owns it, else null: callers answer 404 either way. */
export async function findOwnedCodeReview(id: number, user: User): Promise<CodeReview | null> {
  const review = await CodeReview.find(id)
  if (!review || !assertOwner(review, user)) return null
  return review
}

/**
 * The finding with this id, its review preloaded, if `user` owns that review, else null: callers
 * answer 404 either way.
 */
export async function findOwnedFinding(id: number, user: User): Promise<CodeReviewFinding | null> {
  const finding = await CodeReviewFinding.query().where('id', id).preload('review').first()
  if (!finding || !assertOwner(finding.review, user)) return null
  return finding
}

/** Open findings per review, for the ids given. */
export async function openCounts(ids: readonly number[]): Promise<Map<number, number>> {
  if (ids.length === 0) return new Map()
  const rows = (await db
    .from(CodeReviewFinding.table)
    .whereIn('code_review_id', [...ids])
    .where('resolution', CodeReviewResolution.Open)
    .groupBy('code_review_id')
    .select('code_review_id')
    .count('* as total')) as { code_review_id: number; total: string | number }[]
  return new Map(rows.map((row) => [row.code_review_id, Number(row.total)]))
}

export async function reviewOutput(review: CodeReview): Promise<CodeReviewOutput> {
  const counts = await openCounts([review.id])
  return serializeCodeReview(review, counts.get(review.id) ?? 0)
}
