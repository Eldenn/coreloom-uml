import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import GithubCodeMapFollow from '#app/code-maps/models/github-code-map-follow'
import { serializeCodeMap } from '#app/code-maps/serializers/code-map-serializer'
import { CODE_MAPS_NOT_FOUND, codeMapsEnabled } from '#app/code-maps/services/code-maps-flag'
import {
  GITHUB_IMPORT_REFUSALS,
  GithubImportRefusal,
  importGithubRepository,
  stopFollowing,
} from '#app/code-maps/services/github-import'
import { importGithubCodeMapInput } from '#app/code-maps/validators/code-maps-input'
import type { GithubFollowOutput } from '#app/code-maps/validators/code-maps-output'
import { githubAppConfig } from '#app/github/services/github-app-config'
import { findGrantById } from '#app/github/services/github-grants'
import { findOwnedProject, PROJECT_NOT_FOUND } from '#app/projects/services/owned-project'

export const GITHUB_IMPORT_OFF = {
  error: { message: GITHUB_IMPORT_REFUSALS[GithubImportRefusal.Off] },
} as const
export const GITHUB_IMPORT_RUNNING = {
  error: { message: GITHUB_IMPORT_REFUSALS[GithubImportRefusal.Running] },
} as const
export const GITHUB_FOLLOW_REFUSED = {
  error: { message: GITHUB_IMPORT_REFUSALS[GithubImportRefusal.FollowRefused] },
} as const
export const GITHUB_FOLLOW_NOT_FOUND = {
  error: { message: 'This project follows no GitHub repository.' },
} as const

/**
 * Code maps the server extracts itself from a GitHub repository: the map is created `pending`
 * and `ImportGithubCodeMapJob` has a sandbox clone and read it, with a token of the
 * GitHub App when the owner reaches the repository through it (private repositories). A project
 * can also follow such a repository, so that each push reads it again. Owner-scoped, behind the
 * `code-maps` flag (404 while off).
 */
export default class CodeMapImportsController {
  /**
   * `POST /projects/:id/code-maps/github` `{ url, branch?, follow? }`: 202 with the pending map,
   * which the client polls (`GET /code-maps/:id`) until it is `ready` or `failed`. One extraction
   * per project at a time (409); 503 when the server has no sandboxes. `follow: true` makes the
   * project follow the repository (it must be one of the owner's GitHub App repositories, 422
   * otherwise); `follow: false` stops following; left out, the follow is unchanged.
   */
  async store({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await codeMapsEnabled(user))) return response.notFound(CODE_MAPS_NOT_FOUND)
    const project = await findOwnedProject(params.id, user)
    if (!project) return response.notFound(PROJECT_NOT_FOUND)

    const input = await request.validateUsing(importGithubCodeMapInput)
    const outcome = await db.transaction((trx) => importGithubRepository(project, user, input, trx))
    if ('refused' in outcome) {
      switch (outcome.refused) {
        case GithubImportRefusal.Off:
          return response.serviceUnavailable(GITHUB_IMPORT_OFF)
        case GithubImportRefusal.NotGithub:
          // The validator accepted it, so it parses: checked again for the type only.
          return response.unprocessableEntity({
            error: { message: GITHUB_IMPORT_REFUSALS[GithubImportRefusal.NotGithub] },
          })
        case GithubImportRefusal.FollowRefused:
          return response.unprocessableEntity(GITHUB_FOLLOW_REFUSED)
        default:
          return response.conflict(GITHUB_IMPORT_RUNNING)
      }
    }
    await outcome.queue()
    const { codeMap } = outcome

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
    if (!(await stopFollowing(project))) return response.notFound(GITHUB_FOLLOW_NOT_FOUND)
    return response.noContent()
  }
}
