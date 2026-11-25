import type { HttpContext } from '@adonisjs/core/http'
import CaptureSkillVersionJob from '#app/jobs/capture-skill-version_job'
import ScanSkillVersionJob from '#app/jobs/scan-skill-version_job'
import { paginate } from '#app/shared/pagination/paginate'
import { SkillStatus } from '#app/skills/constants/skill'
import { SkillVersionStatus } from '#app/skills/constants/skill-version'
import CatalogSkill from '#app/skills/models/catalog-skill'
import SkillVersion from '#app/skills/models/skill-version'
import { approvalProblem, canOverride, queueSkillScans } from '#app/skills/services/skill-scans'
import {
  previousApproved,
  readSkillVersionFiles,
  reviewSkillVersion,
} from '#app/skills/services/skill-versions'
import {
  captureSkillVersionInput,
  listSkillVersionsInput,
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
    const overridden = overrideReason !== undefined && canOverride(version, problem)
    if (overrideReason !== undefined && !overridden) {
      return response.unprocessableEntity({
        error: {
          message:
            'A reason is only taken to approve a copy SkillSpector recommends not installing or left passages of unchecked',
          field: 'overrideReason',
        },
      })
    }
    if (problem && !overridden) {
      return response.conflict({
        error: { message: 'This copy cannot be approved', reason: problem },
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
    approvalProblem: approvalProblem(version),
    overridable: canOverride(version, approvalProblem(version)),
    overrideReason: version.overrideReason,
    status: version.status,
    reviewedAt: version.reviewedAt?.toISO() ?? null,
    createdAt: version.createdAt.toISO() ?? '',
  }
}
