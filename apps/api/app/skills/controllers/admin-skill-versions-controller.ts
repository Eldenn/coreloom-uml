import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { LlmCallError, reviewSkill } from '@coreloom-uml/llm'
import CaptureSkillVersionJob from '#app/jobs/capture-skill-version_job'
import ScanSkillVersionJob from '#app/jobs/scan-skill-version_job'
import { llmFailure, userLanguageModel } from '#app/llm/services/language-models'
import { SUBSCRIPTION_NOT_FOUND } from '#app/llm-connections/constants/llm-connections'
import { paginate } from '#app/shared/pagination/paginate'
import { SkillStatus } from '#app/skills/constants/skill'
import { SkillVersionStatus } from '#app/skills/constants/skill-version'
import CatalogSkill from '#app/skills/models/catalog-skill'
import SkillVersion from '#app/skills/models/skill-version'
import { modelReviewSource, type SkillModelReview } from '#app/skills/services/skill-model-reviews'
import { approvalProblem, queueSkillScans } from '#app/skills/services/skill-scans'
import {
  previousApproved,
  readSkillVersionFiles,
  reviewSkillVersion,
} from '#app/skills/services/skill-versions'
import {
  captureSkillVersionInput,
  listSkillVersionsInput,
  modelReviewSkillVersionInput,
  reviewSkillVersionInput,
} from '#app/skills/validators/skill-versions-input'
import type {
  SkillVersionDetailOutput,
  SkillVersionOutput,
  SkillVersionsOutput,
} from '#app/skills/validators/skill-versions-output'

const VERSION_NOT_FOUND = { error: { message: 'Skill version not found' } }

/**
 * The copies of skills' files waiting for the admin (`middleware.admin()`): read one with its
 * diff against the previous approved copy, then approve or reject it. Only an approved copy is
 * ever installed.
 */
export default class AdminSkillVersionsController {
  async index({ request, response }: HttpContext) {
    const { status, skill, ...page } = await request.validateUsing(listSkillVersionsInput, {
      data: request.qs(),
    })
    // Every copy of one skill, or the copies in one status (the ones waiting by default).
    const only = status ?? (skill ? undefined : SkillVersionStatus.Pending)
    const query = SkillVersion.query()
      .if(skill, (versions) =>
        versions.whereHas('skill', (skills) => skills.where('slug', skill as string)),
      )
      .if(only, (versions) => versions.where('status', only as string))
      .preload('skill')
      .orderBy('createdAt', 'desc')
      .orderBy('id', 'desc')
    const output: SkillVersionsOutput = await paginate(query, page, serialize)
    return response.ok(output)
  }

  /**
   * Syncs one skill now instead of at the next weekly search: its audits and its pin are read
   * again, then its files are copied (`syncSkill`). The job does it (no request handler calls
   * skills.sh or GitHub); the copy arrives `pending` like any other. A blocked skill is left alone.
   */
  async store({ request, response }: HttpContext) {
    const { slug } = await request.validateUsing(captureSkillVersionInput)
    const skill = await CatalogSkill.query()
      .where('slug', slug)
      .where('status', SkillStatus.Active)
      .first()
    if (!skill) return response.notFound({ error: { message: 'No skill to sync' } })
    await CaptureSkillVersionJob.dispatch({ slug })
    return response.accepted({ queued: true })
  }

  /** Queues a scan for every pending copy without a verdict (`queueSkillScans`). */
  async scans({ response }: HttpContext) {
    return response.accepted({ queued: await queueSkillScans() })
  }

  /**
   * Queues a scan of one pending copy, again when it has a verdict already. The `skill-scanner`
   * worker runs it: no request handler does.
   */
  async scan({ params, response }: HttpContext) {
    const version = await find(params.id)
    if (!version) return response.notFound(VERSION_NOT_FOUND)
    if (version.status !== SkillVersionStatus.Pending) {
      return response.conflict({ error: { message: 'Only a pending copy is scanned' } })
    }
    await ScanSkillVersionJob.dispatch({ skillVersionId: version.id, force: true })
    return response.accepted({ queued: true })
  }

  /**
   * `POST /admin/skill-versions/:id/model-review`: one call of the admin's own model, which reads
   * the copy's files next to SkillSpector's findings and the passages it left unchecked. Its
   * answer replaces the copy's earlier one and never changes what the admin may decide. The key is
   * used for this call only, never stored or logged; nothing of the files is logged either.
   */
  async modelReview({ params, request, auth, response }: HttpContext) {
    const version = await find(params.id)
    if (!version) return response.notFound(VERSION_NOT_FOUND)
    const { provider, locale } = await request.validateUsing(modelReviewSkillVersionInput)
    const built = await userLanguageModel(provider, auth.getUserOrFail())
    if ('problem' in built)
      return response.unprocessableEntity({ error: { message: built.problem } })
    if ('notFound' in built) return response.notFound(SUBSCRIPTION_NOT_FOUND)
    const log = { skillVersionId: version.id, kind: provider.kind, model: provider.model }
    if ('reason' in built) {
      logger.warn({ ...log, reason: built.reason }, 'skill model review failed')
      return response.badGateway(llmFailure(built.reason))
    }

    const started = performance.now()
    try {
      const { dropped, ...result } = await reviewSkill(
        built.model,
        await modelReviewSource(version, locale),
      )
      logger.info(
        {
          ...log,
          durationMs: Math.round(performance.now() - started),
          verdict: result.verdict,
          notes: result.notes.length,
          dropped,
          omittedFiles: result.omittedFiles.length,
        },
        'skill model review',
      )
      const modelReview: SkillModelReview = {
        ...result,
        model: `${provider.kind} ${provider.model}`,
        reviewedAt: new Date().toISOString(),
      }
      await version.merge({ modelReview }).save()
      const output: SkillVersionOutput = serialize(version)
      return response.ok(output)
    } catch (error) {
      if (!(error instanceof LlmCallError)) throw error
      const durationMs = Math.round(performance.now() - started)
      logger.warn({ ...log, durationMs, reason: error.reason }, 'skill model review failed')
      return response.badGateway(llmFailure(error.reason))
    }
  }

  async show({ params, response }: HttpContext) {
    const version = await find(params.id)
    if (!version) return response.notFound(VERSION_NOT_FOUND)
    const previous = await previousApproved(version)
    if (previous) await previous.load('skill')
    const output: SkillVersionDetailOutput = {
      version: serialize(version),
      files: await readSkillVersionFiles(version),
      previous: previous
        ? { version: serialize(previous), files: await readSkillVersionFiles(previous) }
        : null,
    }
    return response.ok(output)
  }

  async update({ auth, params, request, response }: HttpContext) {
    const version = await find(params.id)
    if (!version) return response.notFound(VERSION_NOT_FOUND)
    const { status, overrideReason } = await request.validateUsing(reviewSkillVersionInput)
    const problem = status === SkillVersionStatus.Approved ? approvalProblem(version) : null
    const overridden = overrideReason !== undefined && problem !== null
    if (overrideReason !== undefined && !overridden) {
      return response.unprocessableEntity({
        error: {
          message: 'A reason is only taken to approve a copy that cannot be approved without one',
          field: 'overrideReason',
        },
      })
    }
    if (problem && !overridden) {
      return response.conflict({
        error: { message: 'This copy is approved only with a reason', reason: problem },
      })
    }
    await reviewSkillVersion(version, status, auth.getUserOrFail(), overrideReason ?? null)
    const output: SkillVersionOutput = serialize(version)
    return response.ok(output)
  }
}

async function find(id: unknown): Promise<SkillVersion | null> {
  const number = Number(id)
  if (!Number.isSafeInteger(number) || number < 1) return null
  return SkillVersion.query().where('id', number).preload('skill').first()
}

function serialize(version: SkillVersion): SkillVersionOutput {
  return {
    id: version.id,
    skill: { slug: version.skill.slug, name: version.skill.name, origin: version.skill.origin },
    contentSha: version.contentSha,
    repository: version.repository,
    commit: version.commit,
    folder: version.folder,
    url: `https://github.com/${version.repository}/tree/${version.commit}/${version.folder}`,
    license: version.license,
    files: version.files,
    bytes: version.bytes,
    scan: version.scan,
    modelReview: version.modelReview,
    approvalProblem: approvalProblem(version),
    overrideReason: version.overrideReason,
    status: version.status,
    reviewedAt: version.reviewedAt?.toISO() ?? null,
    createdAt: version.createdAt.toISO() ?? '',
  }
}
