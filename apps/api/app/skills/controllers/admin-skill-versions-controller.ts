import type { HttpContext } from '@adonisjs/core/http'
import { paginate } from '#app/shared/pagination/paginate'
import { SkillVersionStatus } from '#app/skills/constants/skill-version'
import SkillVersion from '#app/skills/models/skill-version'
import { approvalProblem } from '#app/skills/services/skill-scans'
import {
  previousApproved,
  readSkillVersionFiles,
  reviewSkillVersion,
} from '#app/skills/services/skill-versions'
import {
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
    const { status, ...page } = await request.validateUsing(listSkillVersionsInput, {
      data: request.qs(),
    })
    const query = SkillVersion.query()
      .where('status', status ?? SkillVersionStatus.Pending)
      .preload('skill')
      .orderBy('createdAt', 'desc')
      .orderBy('id', 'desc')
    const output: SkillVersionsOutput = await paginate(query, page, serialize)
    return response.ok(output)
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
    const { status } = await request.validateUsing(reviewSkillVersionInput)
    const problem = status === SkillVersionStatus.Approved ? approvalProblem(version) : null
    if (problem) {
      return response.conflict({
        error: { message: 'This copy cannot be approved', reason: problem },
      })
    }
    await reviewSkillVersion(version, status, auth.getUserOrFail())
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
    status: version.status,
    reviewedAt: version.reviewedAt?.toISO() ?? null,
    createdAt: version.createdAt.toISO() ?? '',
  }
}
