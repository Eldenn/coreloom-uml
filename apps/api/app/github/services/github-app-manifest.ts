import encryption from '@adonisjs/core/services/encryption'
import db from '@adonisjs/lucid/services/db'
import { TokenPurpose } from '#app/auth/constants/token-purpose'
import GithubCodeMapFollow from '#app/code-maps/models/github-code-map-follow'
import {
  GITHUB_APP_CREATED_PATH,
  GITHUB_APP_MANIFEST,
  GITHUB_CALLBACK_PATH,
  GITHUB_URLS,
} from '#app/github/constants/github'
import GithubAppRegistration from '#app/github/models/github-app-registration'
import GithubRepositoryGrant from '#app/github/models/github-repository-grant'
import type { GithubCreatedApp } from '#app/github/services/github-api'
import type User from '#app/users/models/user'
import env from '#start/env'

/**
 * Creating the GitHub App from the settings, with GitHub's manifest flow: the browser posts a
 * manifest to GitHub, the admin confirms there, and GitHub comes back with a `code` the API
 * trades for the App's settings and secrets (`GithubApi.convertManifest`). The secrets are stored
 * encrypted with APP_KEY (`github_app_registrations`) and never leave the server.
 */

/** What GitHub reads to create the App (`POST https://github.com/settings/apps/new`). */
export type GithubAppManifest = {
  name: string
  url: string
  description: string
  public: boolean
  redirect_url: string
  callback_urls: string[]
  setup_url: string
  setup_on_update: boolean
  request_oauth_on_install: boolean
  default_permissions: Record<string, string>
  default_events: string[]
  hook_attributes?: { url: string; active: boolean }
}

type StatePayload = { u: number }

/** The `state` GitHub sends back with the code: the admin who started, for one hour. */
export function createManifestState(user: User): string {
  return encryption.encrypt({ u: user.id } satisfies StatePayload, {
    expiresIn: GITHUB_APP_MANIFEST.stateTtl,
    purpose: TokenPurpose.GithubAppManifest,
  })
}

export function readManifestState(state: string, user: User): boolean {
  const payload = encryption.decrypt<StatePayload>(state, TokenPurpose.GithubAppManifest)
  return payload?.u === user.id
}

/**
 * The manifest. The webhook is left out when the API is not on a public HTTPS address (GitHub
 * cannot deliver there): the App then reads private repositories, but no push is followed.
 */
export function buildManifest(options: { apiUrl: string; public: boolean }): GithubAppManifest {
  const web = new URL(env.get('FRONTEND_URL'))
  const webhookUrl = githubWebhookUrl(options.apiUrl)
  const callback = new URL(GITHUB_CALLBACK_PATH, web).toString()
  return {
    name: suggestedName(web),
    url: web.origin,
    description: GITHUB_APP_MANIFEST.description,
    public: options.public,
    redirect_url: new URL(GITHUB_APP_CREATED_PATH, web).toString(),
    callback_urls: [callback],
    setup_url: callback,
    setup_on_update: true,
    request_oauth_on_install: false,
    default_permissions: { ...GITHUB_APP_MANIFEST.permissions },
    ...(reachable(webhookUrl)
      ? {
          default_events: [...GITHUB_APP_MANIFEST.events],
          hook_attributes: { url: webhookUrl, active: true },
        }
      : { default_events: [] }),
  }
}

/** GitHub's page that takes the manifest, for the admin's account or one of their organizations. */
export function manifestPageUrl(state: string, organization?: string): string {
  const path = organization
    ? `/organizations/${encodeURIComponent(organization)}/settings/apps/new`
    : '/settings/apps/new'
  const url = new URL(path, GITHUB_URLS.web)
  url.searchParams.set('state', state)
  return url.toString()
}

/** Where GitHub delivers the App's events. */
export function githubWebhookUrl(apiUrl: string): string {
  return new URL('/github/webhook', apiUrl).toString()
}

/** Whether GitHub can deliver to this URL: HTTPS, and not a local name or address. */
export function reachable(url: string): boolean {
  const { protocol, hostname } = new URL(url)
  if (protocol !== 'https:') return false
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  return !(
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === '::1' ||
    /^(127|10|0)\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^f[cd][0-9a-f]{2}:/.test(host) ||
    /^fe80:/.test(host)
  )
}

/** "Coreloom UML (uml.example.com)", cut to GitHub's limit; the admin can change it there. */
function suggestedName(web: URL): string {
  const name = `${GITHUB_APP_MANIFEST.name} (${web.hostname})`
  return name.length <= GITHUB_APP_MANIFEST.nameLength ? name : GITHUB_APP_MANIFEST.name
}

/** Keeps the App GitHub created: the only one, its secrets encrypted. */
export async function saveRegistration(app: GithubCreatedApp, user: User): Promise<void> {
  await db.transaction(async (trx) => {
    await GithubAppRegistration.query({ client: trx }).delete()
    await GithubAppRegistration.create(
      {
        appId: app.appId,
        slug: app.slug,
        name: app.name,
        clientId: app.clientId,
        ownerLogin: app.owner.login,
        ownerType: app.owner.type,
        credentials: app.credentials,
        createdByUserId: user.id,
      },
      { client: trx },
    )
  })
}

/**
 * Forgets the App created in the settings, and with it what every user reached through it: their
 * repositories and the projects following one. The App stays on GitHub until deleted there.
 */
export async function removeRegistration(): Promise<void> {
  await db.transaction(async (trx) => {
    await GithubCodeMapFollow.query({ client: trx }).delete()
    await GithubRepositoryGrant.query({ client: trx }).delete()
    await GithubAppRegistration.query({ client: trx }).delete()
  })
}
