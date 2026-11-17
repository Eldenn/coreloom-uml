import type { HttpContext } from '@adonisjs/core/http'
import GithubCodeMapFollow from '#app/code-maps/models/github-code-map-follow'
import { serializeCodeMap } from '#app/code-maps/serializers/code-map-serializer'
import { analyzerUrl } from '#app/code-maps/services/code-map-analyzer'
import { CODE_MAPS_NOT_FOUND, codeMapsEnabled } from '#app/code-maps/services/code-maps-flag'
import { startGithubImport } from '#app/code-maps/services/github-import'
import { parseGithubRepository } from '#app/code-maps/services/github-repository'
import { importGithubCodeMapInput } from '#app/code-maps/validators/code-maps-input'
import type { GithubFollowOutput } from '#app/code-maps/validators/code-maps-output'
import { githubAppConfig } from '#app/github/services/github-app-config'
import { findGrant, findGrantById } from '#app/github/services/github-grants'
import { findOwnedProject, PROJECT_NOT_FOUND } from '#app/projects/services/owned-project'

export const GITHUB_IMPORT_OFF = {
  error: { message: 'Importing from GitHub is not set up on this server.' },
} as const
export const GITHUB_IMPORT_RUNNING = {
  error: { message: 'A repository is already being read for this project.' },
} as const
export const GITHUB_FOLLOW_REFUSED = {
  error: {
    message:
      'Following pushes needs the GitHub App: install it on this repository, then connect GitHub.',
  },
} as const
export const GITHUB_FOLLOW_NOT_FOUND = {
  error: { message: 'This project follows no GitHub repository.' },
} as const

/**
 * Code maps the server extracts itself from a GitHub repository: the map is created `pending`
 * and `ImportGithubCodeMapJob` has the analyzer service clone and read it, with a token of the
 * GitHub App when the owner reaches the repository through it (private repositories). A project
 * can also follow such a repository, so that each push reads it again. Owner-scoped, behind the
 * `code-maps` flag (404 while off).
 */
export default class CodeMapImportsController {
  /**
   * `POST /projects/:id/code-maps/github` `{ url, branch?, follow? }`: 202 with the pending map,
   * which the client polls (`GET /code-maps/:id`) until it is `ready` or `failed`. One extraction
   * per project at a time (409); 503 when the server has no analyzer. `follow: true` makes the
   * project follow the repository (it must be one of the owner's GitHub App repositories, 422
   * otherwise); `follow: false` stops following; left out, the follow is unchanged.
   */
  async store({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await codeMapsEnabled(user))) return response.notFound(CODE_MAPS_NOT_FOUND)
    const project = await findOwnedProject(params.id, user)
    if (!project) return response.notFound(PROJECT_NOT_FOUND)

    const { url, branch, follow } = await request.validateUsing(importGithubCodeMapInput)
    if (!analyzerUrl()) return response.serviceUnavailable(GITHUB_IMPORT_OFF)
    // The validator accepted it, so it parses; checked again for the type only.
    const repository = parseGithubRepository(url)
    if (!repository)
      return response.unprocessableEntity({ error: { message: 'Not a GitHub repository' } })

    const grant = (await githubAppConfig()) ? await findGrant(user.id, repository.url) : null
    if (follow === true && !grant) return response.unprocessableEntity(GITHUB_FOLLOW_REFUSED)
    // The name as GitHub spells it, when the App lists the repository.
    const repositoryUrl = grant?.url ?? repository.url

    const codeMap = await startGithubImport({
      projectId: project.id,
      userId: user.id,
      repositoryUrl,
      branch: branch ?? null,
    })
    if (!codeMap) return response.conflict(GITHUB_IMPORT_RUNNING)

    if (follow === true && grant) {
      await GithubCodeMapFollow.updateOrCreate(
        { projectId: project.id },
        {
          userId: user.id,
          repositoryId: grant.repositoryId,
          repositoryUrl,
          branch: branch ?? null,
        },
      )
    } else if (follow === false) {
      await GithubCodeMapFollow.query().where('projectId', project.id).delete()
    }

    return response.accepted({ codeMap: serializeCodeMap(codeMap) })
  }

  /** `GET /projects/:id/code-maps/github/follow`: the repository the project follows, or null. */
  async showFollow({ params, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await codeMapsEnabled(user))) return response.notFound(CODE_MAPS_NOT_FOUND)
    const project = await findOwnedProject(params.id, user)
    if (!project) return response.notFound(PROJECT_NOT_FOUND)
    const follow = await GithubCodeMapFollow.findBy('projectId', project.id)
    let output: GithubFollowOutput | null = null
    if (follow) {
      output = {
        repositoryUrl: follow.repositoryUrl,
        branch: follow.branch,
        // False once the owner lost the repository on GitHub: pushes are then ignored.
        active:
          (await githubAppConfig()) !== null &&
          (await findGrantById(user.id, follow.repositoryId)) !== null,
      }
    }
    return response.ok({ follow: output })
  }

  /** `DELETE /projects/:id/code-maps/github/follow`: stop reading the repository on each push. */
  async destroyFollow({ params, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await codeMapsEnabled(user))) return response.notFound(CODE_MAPS_NOT_FOUND)
    const project = await findOwnedProject(params.id, user)
    if (!project) return response.notFound(PROJECT_NOT_FOUND)
    const follow = await GithubCodeMapFollow.findBy('projectId', project.id)
    if (!follow) return response.notFound(GITHUB_FOLLOW_NOT_FOUND)
    await follow.delete()
    return response.noContent()
  }
}
