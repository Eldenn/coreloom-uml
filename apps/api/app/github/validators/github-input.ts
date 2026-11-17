import vine from '@vinejs/vine'
import { GITHUB_LIMITS } from '#app/github/constants/github'

/** What `POST /github/connection/start` sends the browser to. */
export const GithubConnectionTarget = {
  /** GitHub's page to install the App or change the repositories it reads. */
  Install: 'install',
  /** GitHub's authorization page, which lists what the user reaches through the App. */
  Authorize: 'authorize',
} as const
export type GithubConnectionTarget =
  (typeof GithubConnectionTarget)[keyof typeof GithubConnectionTarget]

/**
 * `POST /github/connection/start`: where to go, and the web app's page to come back to, or the
 * `state` of a connection under way (GitHub sends it back after an installation) to carry on to.
 */
export const startGithubConnectionInput = vine.create(
  vine.object({
    target: vine.enum(Object.values(GithubConnectionTarget)),
    returnTo: vine.string().maxLength(GITHUB_LIMITS.returnTo).optional(),
    state: vine.string().maxLength(GITHUB_LIMITS.state).optional(),
  }),
)

/** `POST /github/connection`: what GitHub sent back to the callback page. */
export const completeGithubConnectionInput = vine.create(
  vine.object({
    code: vine
      .string()
      .maxLength(GITHUB_LIMITS.code)
      .regex(/^[A-Za-z0-9_-]+$/),
    state: vine.string().maxLength(GITHUB_LIMITS.state),
  }),
)

/**
 * `POST /admin/github-app/manifest`: the organization to create the App under (the admin's own
 * account when left out), and whether other GitHub accounts may install it.
 */
export const startGithubAppInput = vine.create(
  vine.object({
    organization: vine
      .string()
      .trim()
      .maxLength(39)
      .regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/)
      .optional(),
    public: vine.boolean().optional(),
  }),
)

/** `POST /admin/github-app`: what GitHub sent back once the App was created. */
export const completeGithubAppInput = vine.create(
  vine.object({
    code: vine
      .string()
      .maxLength(GITHUB_LIMITS.code)
      .regex(/^[A-Za-z0-9_-]+$/),
    state: vine.string().maxLength(GITHUB_LIMITS.state),
  }),
)
