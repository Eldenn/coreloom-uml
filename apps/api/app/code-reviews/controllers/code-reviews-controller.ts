import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import Architecture from '#app/architectures/models/architecture'
import { CodeMapStatus } from '#app/code-maps/constants/code-map'
import { CODE_MAPS_NOT_FOUND, codeMapsEnabled } from '#app/code-maps/services/code-maps-flag'
import { CODE_MAP_NOT_FOUND, findOwnedCodeMap } from '#app/code-maps/services/owned-code-map'
import {
  CODE_REVIEW_LIMITS,
  type CodeReviewDiagram,
  CodeReviewDiagramStatus,
  REVIEWABLE_DIAGRAM_KINDS,
} from '#app/code-reviews/constants/code-review'
import CodeReview from '#app/code-reviews/models/code-review'
import CodeReviewFinding from '#app/code-reviews/models/code-review-finding'
import {
  serializeCodeReview,
  serializeCodeReviewFinding,
} from '#app/code-reviews/serializers/code-review-serializer'
import { deleteCodeReview } from '#app/code-reviews/services/code-review-writes'
import {
  CODE_REVIEW_NOT_FOUND,
  findOwnedCodeReview,
  openCounts,
  reviewOutput,
} from '#app/code-reviews/services/owned-code-review'
import {
  createCodeReviewInput,
  listCodeReviewsInput,
} from '#app/code-reviews/validators/code-reviews-input'
import type {
  CodeReviewDetailOutput,
  CodeReviewOutput,
} from '#app/code-reviews/validators/code-reviews-output'
import { findOwnedProject, PROJECT_NOT_FOUND } from '#app/projects/services/owned-project'
import { paginate } from '#app/shared/pagination/paginate'

const reviewable = (kind: string) => (REVIEWABLE_DIAGRAM_KINDS as readonly string[]).includes(kind)

/**
 * Conformance reviews of a project's diagrams against one of its code maps. Starting one calls no
 * model: the browser then asks for each diagram in turn (`code-review-diagrams-controller`).
 * Owner-scoped, behind the `code-maps` flag (404 while off).
 */
export default class CodeReviewsController {
  /** `GET /projects/:id/code-reviews`, newest first. */
  async index({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await codeMapsEnabled(user))) return response.notFound(CODE_MAPS_NOT_FOUND)
    const { page, perPage } = await request.validateUsing(listCodeReviewsInput)
    const project = await findOwnedProject(params.id, user)
    if (!project) return response.notFound(PROJECT_NOT_FOUND)

    const query = CodeReview.query()
      .where('projectId', project.id)
      .orderBy('createdAt', 'desc')
      .orderBy('id', 'desc')
    const listed = await paginate(query, { page, perPage }, (review) => review)
    const counts = await openCounts(listed.data.map((review) => review.id))
    return response.ok({
      data: listed.data.map(
        (review): CodeReviewOutput => serializeCodeReview(review, counts.get(review.id) ?? 0),
      ),
      meta: listed.meta,
    })
  }

  /**
   * `POST /code-reviews`: the diagrams to check, all of the map's project, of a kind the map has
   * a counterpart for, and not empty. The project keeps its `CODE_REVIEW_LIMITS.perProject`
   * newest reviews.
   */
  async store({ request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await codeMapsEnabled(user))) return response.notFound(CODE_MAPS_NOT_FOUND)
    const { codeMapId, diagramIds, includeSnippets, locale } =
      await request.validateUsing(createCodeReviewInput)
    const codeMap = await findOwnedCodeMap(codeMapId, user)
    if (!codeMap) return response.notFound(CODE_MAP_NOT_FOUND)
    if (codeMap.status !== CodeMapStatus.Ready || !codeMap.storageKey) {
      return response.conflict({ error: { message: 'This code map is not ready' } })
    }

    const architectures = await Architecture.query()
      .where('projectId', codeMap.projectId)
      .where('userId', user.id)
      .preload('diagrams')
    const diagrams = new Map(
      architectures.flatMap((architecture) =>
        architecture.diagrams.map((diagram) => [diagram.id, diagram] as const),
      ),
    )
    const entries: CodeReviewDiagram[] = []
    for (const id of diagramIds) {
      const diagram = diagrams.get(id)
      if (!diagram) return response.notFound({ error: { message: 'Diagram not found' } })
      if (!diagram.content || !reviewable(diagram.kind)) {
        return response.unprocessableEntity({
          error: {
            message: `The diagram "${diagram.title}" cannot be reviewed against the code: only ${REVIEWABLE_DIAGRAM_KINDS.join(', ')} diagrams with content can.`,
          },
        })
      }
      entries.push({
        diagramId: diagram.id,
        title: diagram.title,
        kind: diagram.kind,
        status: CodeReviewDiagramStatus.Pending,
        reason: null,
        findingCount: 0,
        dropped: 0,
        truncated: false,
        source: null,
        reviewedAt: null,
      })
    }

    const review = await db.transaction(async (trx) => {
      const created = await CodeReview.create(
        {
          projectId: codeMap.projectId,
          userId: user.id,
          codeMapId: codeMap.id,
          repositoryUrl: codeMap.repositoryUrl,
          branch: codeMap.branch,
          commitSha: codeMap.commitSha,
          providerKind: null,
          model: null,
          includeSnippets: includeSnippets ?? false,
          locale,
          diagrams: entries,
        },
        { client: trx },
      )
      const older = await CodeReview.query({ client: trx })
        .where('projectId', codeMap.projectId)
        .orderBy('createdAt', 'desc')
        .orderBy('id', 'desc')
        .offset(CODE_REVIEW_LIMITS.perProject)
        .select('id')
      if (older.length > 0) {
        await CodeReview.query({ client: trx })
          .whereIn(
            'id',
            older.map((row) => row.id),
          )
          .delete()
      }
      return created
    })

    return response.created({
      review: serializeCodeReview(review, 0),
      findings: [],
    } satisfies CodeReviewDetailOutput)
  }

  /** `GET /code-reviews/:id`: where each diagram stands, and every finding. */
  async show({ params, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await codeMapsEnabled(user))) return response.notFound(CODE_MAPS_NOT_FOUND)
    const review = await findOwnedCodeReview(params.id, user)
    if (!review) return response.notFound(CODE_REVIEW_NOT_FOUND)

    const findings = await CodeReviewFinding.query()
      .where('codeReviewId', review.id)
      .orderBy('diagramId', 'asc')
      .orderBy('id', 'asc')
    return response.ok({
      review: await reviewOutput(review),
      findings: findings.map(serializeCodeReviewFinding),
    } satisfies CodeReviewDetailOutput)
  }

  /** `DELETE /code-reviews/:id`, with its findings. */
  async destroy({ params, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await codeMapsEnabled(user))) return response.notFound(CODE_MAPS_NOT_FOUND)
    const review = await findOwnedCodeReview(params.id, user)
    if (!review) return response.notFound(CODE_REVIEW_NOT_FOUND)
    await deleteCodeReview(review)
    return response.noContent()
  }
}
