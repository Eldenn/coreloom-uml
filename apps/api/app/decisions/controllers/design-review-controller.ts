import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { LlmCallError, reviewDesign } from '@coreloom-uml/llm'
import {
  ARCHITECTURE_NOT_FOUND,
  findOwnedArchitecture,
} from '#app/architectures/services/owned-architecture'
import { projectDesignFindings } from '#app/decisions/services/design-review'
import {
  designReviewSource,
  projectModelFindings,
  serializeDesignFinding,
  storeDesignFindings,
} from '#app/decisions/services/model-design-review'
import { reviewDesignInput } from '#app/decisions/validators/decisions-input'
import { llmFailure, userLanguageModel } from '#app/llm/services/language-models'
import { SUBSCRIPTION_NOT_FOUND } from '#app/llm-connections/constants/llm-connections'
import { findOwnedProject, PROJECT_NOT_FOUND } from '#app/projects/services/owned-project'
import {
  DESIGN_RECORDS_NOT_FOUND,
  designRecordsEnabled,
} from '#app/requirements/services/design-records-flag'

const NO_PROJECT = {
  error: { message: 'An architecture outside any project has no requirement or decision.' },
} as const

/**
 * The review of a project's design, behind `design-records`. What its requirements and decisions
 * say against themselves is read from the stored records each time, with no model. What the
 * owner's model finds in an architecture's views is one call per architecture, kept until the
 * next review of that architecture.
 */
export default class DesignReviewController {
  /** `GET /projects/:id/design-review` */
  async show({ params, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await designRecordsEnabled(user))) return response.notFound(DESIGN_RECORDS_NOT_FOUND)
    const project = await findOwnedProject(params.id, user)
    if (!project) return response.notFound(PROJECT_NOT_FOUND)
    const [findings, modelFindings] = await Promise.all([
      projectDesignFindings(project.id),
      projectModelFindings(project.id),
    ])
    return response.ok({ findings, modelFindings: modelFindings.map(serializeDesignFinding) })
  }

  /**
   * `POST /architectures/:id/design-review`: one call of the owner's model, whose findings
   * replace the architecture's earlier ones. The key is used for this call only, never stored or
   * logged; the views, the requirements and the decisions are never logged either.
   */
  async store({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await designRecordsEnabled(user))) return response.notFound(DESIGN_RECORDS_NOT_FOUND)
    const { provider, locale } = await request.validateUsing(reviewDesignInput)
    const architecture = await findOwnedArchitecture(params.id, user)
    if (!architecture) return response.notFound(ARCHITECTURE_NOT_FOUND)
    const { projectId } = architecture
    if (projectId === null) return response.unprocessableEntity(NO_PROJECT)
    const inProject = Object.assign(architecture, { projectId })
    const source = await designReviewSource(inProject, locale)
    if ('problem' in source)
      return response.unprocessableEntity({ error: { message: source.problem } })

    const built = await userLanguageModel(provider, user)
    if ('problem' in built)
      return response.unprocessableEntity({ error: { message: built.problem } })
    if ('notFound' in built) return response.notFound(SUBSCRIPTION_NOT_FOUND)
    const log = { architectureId: architecture.id, kind: provider.kind, model: provider.model }
    if ('reason' in built) {
      logger.warn({ ...log, reason: built.reason }, 'design review failed')
      return response.badGateway(llmFailure(built.reason))
    }

    const started = performance.now()
    try {
      const result = await reviewDesign(built.model, source)
      logger.info(
        {
          ...log,
          durationMs: Math.round(performance.now() - started),
          findings: result.findings.length,
          dropped: result.dropped,
          omittedViews: result.omittedViews,
        },
        'design review',
      )
      const stored = await storeDesignFindings(inProject, result.findings)
      return response.ok({
        findings: stored.map(serializeDesignFinding),
        omittedViews: result.omittedViews,
      })
    } catch (error) {
      if (!(error instanceof LlmCallError)) throw error
      const durationMs = Math.round(performance.now() - started)
      logger.warn({ ...log, durationMs, reason: error.reason }, 'design review failed')
      return response.badGateway(llmFailure(error.reason))
    }
  }
}
