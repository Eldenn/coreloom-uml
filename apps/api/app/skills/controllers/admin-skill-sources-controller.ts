import type { HttpContext } from '@adonisjs/core/http'
import app from '@adonisjs/core/services/app'
import { SkillSourceKind } from '#app/skills/constants/skill'
import SkillSource from '#app/skills/models/skill-source'
import { serializeSkillSource } from '#app/skills/serializers/skill-source-serializer'
import SkillsEvents from '#app/skills/services/skills-events'
import {
  createSkillSourceInput,
  updateSkillSourceInput,
} from '#app/skills/validators/skill-sources-input'

const NOT_FOUND = { error: { message: 'Source not found' } }

/**
 * Where the weekly search looks for skills, managed by the admin (`middleware.admin()`). These
 * routes only write rows: the next run reads a new source (no request handler calls GitHub).
 */
export default class AdminSkillSourcesController {
  /** skills.sh first, then the repositories in the order they were added. */
  async index({ response }: HttpContext) {
    const sources = await SkillSource.query().withCount('skills').orderBy('id')
    return response.ok({ data: sources.map(serializeSkillSource) })
  }

  /** Trusts a GitHub repository, or one folder of it. */
  async store({ request, response }: HttpContext) {
    const { owner, repo, path } = await request.validateUsing(createSkillSourceInput)
    const identity = { kind: SkillSourceKind.Github, owner, repo, path: path || null }
    const existing = await SkillSource.query()
      .where('kind', identity.kind)
      .where('owner', owner)
      .where('repo', repo)
      .if(
        identity.path,
        (query) => query.where('path', identity.path as string),
        (query) => query.whereNull('path'),
      )
      .first()
    if (existing) return response.conflict({ error: { message: 'This source exists already' } })
    const source = await SkillSource.create(identity)
    await publish()
    return response.created({ source: await withCount(source) })
  }

  async update({ params, request, response }: HttpContext) {
    const { enabled } = await request.validateUsing(updateSkillSourceInput)
    const source = await SkillSource.find(Number(params.id))
    if (!source) return response.notFound(NOT_FOUND)
    await source.merge({ enabled }).save()
    await publish()
    return response.ok({ source: await withCount(source) })
  }

  /** A repository only: skills.sh is disabled, never deleted. */
  async destroy({ params, response }: HttpContext) {
    const source = await SkillSource.find(Number(params.id))
    if (!source) return response.notFound(NOT_FOUND)
    if (source.kind === SkillSourceKind.SkillsSh) {
      return response.conflict({ error: { message: 'skills.sh can be disabled, not deleted' } })
    }
    await source.delete()
    await publish()
    return response.noContent()
  }
}

async function withCount(source: SkillSource) {
  const row = await SkillSource.query().where('id', source.id).withCount('skills').firstOrFail()
  return serializeSkillSource(row)
}

async function publish() {
  await (await app.container.make(SkillsEvents)).publish('catalog.updated')
}
