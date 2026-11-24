import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import {
  type ConformanceResult,
  LlmCallError,
  type LlmFailureReason,
  reviewConformance,
} from '@coreloom-uml/llm'
import { DateTime } from 'luxon'
import { CodeMapStatus } from '#app/code-maps/constants/code-map'
import CodeMap from '#app/code-maps/models/code-map'
import { readCodeMapFile } from '#app/code-maps/services/code-map-storage'
import { CODE_MAPS_NOT_FOUND, codeMapsEnabled } from '#app/code-maps/services/code-maps-flag'
import { readSource, sourceExplorer } from '#app/code-maps/services/code-source'
import { diagramLinks, matchStoredDiagram } from '#app/code-maps/services/diagram-code-links'
import {
  type CodeReviewDiagram,
  CodeReviewDiagramStatus,
  CodeReviewResolution,
  SOURCE_REVIEW_KINDS,
  UNLINKED_ACTIVITY_COMMENT,
} from '#app/code-reviews/constants/code-review'
import CodeReview from '#app/code-reviews/models/code-review'
import CodeReviewFinding from '#app/code-reviews/models/code-review-finding'
import { serializeCodeReviewFinding } from '#app/code-reviews/serializers/code-review-serializer'
import {
  CODE_REVIEW_NOT_FOUND,
  findOwnedCodeReview,
  reviewOutput,
} from '#app/code-reviews/services/owned-code-review'
import { conformanceSource } from '#app/code-reviews/services/review-source'
import { reviewDiagramInput } from '#app/code-reviews/validators/code-reviews-input'
import type { CodeReviewDetailOutput } from '#app/code-reviews/validators/code-reviews-output'
import Diagram from '#app/diagrams/models/diagram'
import { llmFailure, userLanguageModel } from '#app/llm/services/language-models'
import { SUBSCRIPTION_NOT_FOUND } from '#app/llm-connections/constants/llm-connections'

const DIAGRAM_NOT_FOUND = { error: { message: 'Diagram not found' } } as const
const MAP_GONE = {
  error: { message: 'The code map of this review is gone: start a review on another map.' },
} as const

/**
 * One diagram of a review checked by the user's own model: one call, the findings it returns
 * replace the diagram's earlier ones in this review. The key is used for this call only, never
 * stored or logged. In a review started with `includeSnippets`, a class, sequence or activity diagram is
 * checked with the source of its files, read in a sandbox for this call (`readSource`): never stored,
 * logged or returned, and a read that fails leaves the review on the structure. Session only.
 */
export default class CodeReviewDiagramsController {
  /** `POST /code-reviews/:id/diagrams/:diagramId` */
  async store({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await codeMapsEnabled(user))) return response.notFound(CODE_MAPS_NOT_FOUND)
    const review = await findOwnedCodeReview(params.id, user)
    if (!review) return response.notFound(CODE_REVIEW_NOT_FOUND)
    const diagramId = Number(params.diagramId)
    if (!review.diagrams.some((entry) => entry.diagramId === diagramId)) {
      return response.notFound(DIAGRAM_NOT_FOUND)
    }
    const diagram = await Diagram.query().where('id', diagramId).preload('architecture').first()
    if (
      !diagram?.content ||
      diagram.architecture.userId !== user.id ||
      diagram.architecture.projectId !== review.projectId
    ) {
      return response.notFound(DIAGRAM_NOT_FOUND)
    }

    const { provider, apiKey } = await request.validateUsing(reviewDiagramInput)
    const codeMap = review.codeMapId ? await CodeMap.find(review.codeMapId) : null
    if (!codeMap || codeMap.status !== CodeMapStatus.Ready || !codeMap.storageKey) {
      return response.conflict(MAP_GONE)
    }

    const built = await userLanguageModel(provider, apiKey, user)
    if ('problem' in built)
      return response.unprocessableEntity({ error: { message: built.problem } })
    if ('notFound' in built) return response.notFound(SUBSCRIPTION_NOT_FOUND)
    const log = { reviewId: review.id, diagramId, kind: provider.kind, model: provider.model }
    if ('reason' in built) {
      logger.warn({ ...log, reason: built.reason }, 'code review failed')
      await markFailed(review.id, diagramId, built.reason)
      return response.badGateway(llmFailure(built.reason))
    }

    const map = await readCodeMapFile(codeMap.storageKey)
    const match = matchStoredDiagram(diagram, map, await diagramLinks(diagram))
    const { source, evidence } = conformanceSource(
      { id: diagram.id, kind: diagram.kind, title: diagram.title, content: diagram.content },
      map,
      match,
      review.locale,
    )

    const started = performance.now()
    // An activity diagram is compared through its links alone: with none, nothing is read or asked.
    const unlinked =
      diagram.kind === 'activity' && source.elements.every((element) => !element.codeKeys.length)
    const reading =
      !unlinked && review.includeSnippets && SOURCE_REVIEW_KINDS.includes(diagram.kind)
        ? await readSource(
            codeMap,
            user,
            source.nodes,
            sourceExplorer(
              provider.kind,
              built.model,
              `A UML ${diagram.kind} diagram will be checked against this code: what the code does that the diagram does not show, and what the diagram shows that the code does not do.`,
            ),
          )
        : null
    let result: ConformanceResult
    try {
      result = unlinked
        ? {
            findings: [
              {
                elementId: null,
                status: 'uncertain',
                severity: 'low',
                comment: UNLINKED_ACTIVITY_COMMENT[review.locale],
                evidence: [],
              },
            ],
            dropped: 0,
            omittedNodes: 0,
            truncated: false,
          }
        : await reviewConformance(built.model, { ...source, sources: reading?.excerpts })
    } catch (error) {
      if (!(error instanceof LlmCallError)) throw error
      const durationMs = Math.round(performance.now() - started)
      logger.warn({ ...log, durationMs, reason: error.reason }, 'code review failed')
      await markFailed(review.id, diagramId, error.reason)
      return response.badGateway(llmFailure(error.reason))
    }
    logger.info(
      {
        ...log,
        durationMs: Math.round(performance.now() - started),
        findings: result.findings.length,
        dropped: result.dropped,
        omittedNodes: result.omittedNodes,
        sourceFiles: reading?.excerpts.length ?? 0,
      },
      'code review',
    )

    const { updated, findings } = await db.transaction(async (trx) => {
      const locked = await CodeReview.query({ client: trx })
        .where('id', review.id)
        .forUpdate()
        .firstOrFail()
      await CodeReviewFinding.query({ client: trx })
        .where('codeReviewId', locked.id)
        .where('diagramId', diagramId)
        .delete()
      const created = result.findings.length
        ? await CodeReviewFinding.createMany(
            result.findings.map((finding) => ({
              codeReviewId: locked.id,
              diagramId,
              elementId: finding.elementId,
              status: finding.status,
              severity: finding.severity,
              comment: finding.comment,
              evidence: finding.evidence.map(evidence),
              resolution: CodeReviewResolution.Open,
            })),
            { client: trx },
          )
        : []
      locked.diagrams = withEntry(locked.diagrams, diagramId, {
        status: CodeReviewDiagramStatus.Done,
        reason: null,
        findingCount: created.length,
        dropped: result.dropped,
        truncated: result.truncated,
        source: reading && {
          files: reading.excerpts.length - reading.commands,
          omitted: reading.omitted,
          absence: reading.absence,
        },
        reviewedAt: DateTime.now().toISO(),
      })
      locked.providerKind = provider.kind
      locked.model = provider.model
      await locked.save()
      return { updated: locked, findings: created }
    })

    return response.ok({
      review: await reviewOutput(updated),
      findings: findings.map(serializeCodeReviewFinding),
    } satisfies CodeReviewDetailOutput)
  }
}

function withEntry(
  entries: readonly CodeReviewDiagram[],
  diagramId: number,
  change: Partial<CodeReviewDiagram>,
): CodeReviewDiagram[] {
  return entries.map((entry) => (entry.diagramId === diagramId ? { ...entry, ...change } : entry))
}

/** Keeps the reason a diagram's call failed; its earlier findings, if any, stay. */
async function markFailed(reviewId: number, diagramId: number, reason: LlmFailureReason) {
  await db.transaction(async (trx) => {
    const locked = await CodeReview.query({ client: trx }).where('id', reviewId).forUpdate().first()
    if (!locked) return
    const entry = locked.diagrams.find((item) => item.diagramId === diagramId)
    locked.diagrams = withEntry(locked.diagrams, diagramId, {
      status:
        entry?.reviewedAt !== null && entry?.reviewedAt !== undefined
          ? CodeReviewDiagramStatus.Done
          : CodeReviewDiagramStatus.Failed,
      reason,
    })
    await locked.save()
  })
}
