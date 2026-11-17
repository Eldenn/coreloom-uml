/**
 * The GitHub App that lets the server read the private repositories a user installed it on
 * (`app/github/`). Nothing here is a secret: the App's settings come from the environment, or
 * from the App the admin created in the settings (`#app/github/services/github-app-config`).
 */

/**
 * Where GitHub answers: the REST API, the web host of the OAuth and installation pages, and the
 * host of public files (`{raw}/{owner}/{name}/{ref}/{path}`), outside the anonymous API's quota.
 */
export const GITHUB_URLS = {
  api: 'https://api.github.com',
  web: 'https://github.com',
  raw: 'https://raw.githubusercontent.com',
} as const

/** One file read from a repository (`GithubApi.readFile`). */
export const GITHUB_SOURCE_LIMITS = {
  /** Past it, the read stops and the file is left out. */
  fileBytes: 512_000,
  pathLength: 400,
} as const

/** The REST API version every call pins. */
export const GITHUB_API_VERSION = '2022-11-28'

/** Sent with every call: GitHub refuses a request without a User-Agent. */
export const GITHUB_USER_AGENT = 'coreloom-uml'

/** The webhook events the App subscribes to and the server reads; any other is acknowledged. */
export const GithubEvent = {
  Ping: 'ping',
  Push: 'push',
  Installation: 'installation',
  InstallationRepositories: 'installation_repositories',
  AppAuthorization: 'github_app_authorization',
} as const
export type GithubEvent = (typeof GithubEvent)[keyof typeof GithubEvent]

/** The headers GitHub signs and names a delivery with. */
export const GithubHeader = {
  Event: 'x-github-event',
  Signature: 'x-hub-signature-256',
  Delivery: 'x-github-delivery',
} as const

export const GITHUB_LIMITS = {
  /** How long a connection's `state` stays valid, from the click to GitHub's redirect. */
  stateTtl: '10 minutes',
  /** Repositories one connection keeps (all installations together): past it, the rest is left out. */
  repositories: 1000,
  /** Installations read for one connection. */
  installations: 100,
  /** GitHub's largest page. */
  perPage: 100,
  /** One GitHub call. */
  requestTimeoutMs: 15_000,
  /** The App's own token (a JWT): GitHub accepts 10 minutes at most, clocks drift. */
  appJwtSeconds: 9 * 60,
  appJwtBackdateSeconds: 60,
  /** `code` and `state` as GitHub sends them back. */
  code: 100,
  state: 2000,
  /** Where the browser goes back to after GitHub, a path of the web app. */
  returnTo: 500,
} as const

/** Where the App's settings come from: the environment wins over the settings. */
export const GithubAppSource = {
  Environment: 'environment',
  Settings: 'settings',
} as const
export type GithubAppSource = (typeof GithubAppSource)[keyof typeof GithubAppSource]

/** The kind of GitHub account that owns the App. */
export const GithubAppOwnerType = {
  User: 'User',
  Organization: 'Organization',
} as const
export type GithubAppOwnerType = (typeof GithubAppOwnerType)[keyof typeof GithubAppOwnerType]

/** The App's creation from a manifest (GitHub's "manifest flow"). */
export const GITHUB_APP_MANIFEST = {
  /** GitHub's code is good for one hour; the state lives as long. */
  stateTtl: '1 hour',
  /** GitHub refuses an App name over 34 characters. */
  nameLength: 34,
  /** The name suggested on GitHub's page, where the admin can change it. */
  name: 'Coreloom UML',
  description: 'Reads the repositories it is installed on to map their code in Coreloom UML.',
  /** Read only: the contents to clone, the metadata GitHub always grants. */
  permissions: { contents: 'read', metadata: 'read' },
  /** Installation events reach every App; push is the one it subscribes to. */
  events: ['push'],
} as const

/** The web app's page GitHub comes back to once the App is created (`?code=…&state=…`). */
export const GITHUB_APP_CREATED_PATH = '/github/app-created'

/** The web app's page GitHub comes back to after an installation or an authorization. */
export const GITHUB_CALLBACK_PATH = '/github/callback'

/** Where the web app comes back when the `state` names no page. */
export const GITHUB_DEFAULT_RETURN_TO = '/projects'

/** Why a call to GitHub did not give what the caller needed. */
export const GithubFailure = {
  /** The App is not set up on this server. */
  Unavailable: 'unavailable',
  /** GitHub refused the code, the token or the installation (gone, suspended, no access). */
  Denied: 'denied',
  /** GitHub could not be reached or broke: worth another try. */
  Unreachable: 'unreachable',
} as const
export type GithubFailure = (typeof GithubFailure)[keyof typeof GithubFailure]
