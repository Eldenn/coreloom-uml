import { createPrivateKey, type KeyObject } from 'node:crypto'
import { GITHUB_URLS, GithubAppOwnerType, GithubAppSource } from '#app/github/constants/github'
import GithubAppRegistration from '#app/github/models/github-app-registration'
import env from '#start/env'

/**
 * The GitHub App's settings: from the environment when all six variables are set, otherwise from
 * the App the admin created in the settings (`github_app_registrations`). Without either, the
 * App is off: its routes answer 404 and the webhook refuses every delivery.
 */
export type GithubAppConfig = {
  source: GithubAppSource
  appId: string
  slug: string
  /** The App's name on GitHub; its slug when it comes from the environment. */
  name: string
  clientId: string
  clientSecret: string
  privateKey: KeyObject
  /** Null for an App created without a webhook: deliveries are refused. */
  webhookSecret: string | null
  /** The GitHub account that owns the App, when known (not from the environment). */
  owner: { login: string; type: GithubAppOwnerType } | null
}

type Values = {
  appId: string
  slug: string
  clientId: string
  clientSecret: string
  privateKey: string
  webhookSecret: string
}

let fromEnvironment: { source: string; config: GithubAppConfig | null } | undefined
let fromSettings: { source: string; config: GithubAppConfig | null } | undefined

/** The App's settings, or null when none are set or the private key does not parse. */
export async function githubAppConfig(): Promise<GithubAppConfig | null> {
  return environmentConfig() ?? (await settingsConfig())
}

/** The App the environment sets, when all six variables are there and valid. */
export function environmentConfig(): GithubAppConfig | null {
  const values: Values = {
    appId: env.get('GITHUB_APP_ID')?.trim() ?? '',
    slug: env.get('GITHUB_APP_SLUG')?.trim() ?? '',
    clientId: env.get('GITHUB_APP_CLIENT_ID')?.trim() ?? '',
    clientSecret: env.get('GITHUB_APP_CLIENT_SECRET')?.trim() ?? '',
    privateKey: env.get('GITHUB_APP_PRIVATE_KEY')?.trim() ?? '',
    webhookSecret: env.get('GITHUB_APP_WEBHOOK_SECRET') ?? '',
  }
  const source = JSON.stringify(values)
  if (fromEnvironment?.source === source) return fromEnvironment.config
  const config = Object.values(values).some((value) => value === '')
    ? null
    : build(values, GithubAppSource.Environment, { name: values.slug, owner: null })
  fromEnvironment = { source, config }
  return config
}

/**
 * The App created in the settings. Read on every call, so the API and the queue worker see a
 * creation or a removal at once; the key is parsed again only when the row changed.
 */
async function settingsConfig(): Promise<GithubAppConfig | null> {
  const registration = await GithubAppRegistration.query().orderBy('id', 'desc').first()
  if (!registration) return null
  const source = `${String(registration.id)}:${registration.updatedAt.toISO() ?? ''}`
  if (fromSettings?.source === source) return fromSettings.config
  const credentials = registration.credentials
  const config = credentials
    ? build(
        {
          appId: String(registration.appId),
          slug: registration.slug,
          clientId: registration.clientId,
          clientSecret: credentials.clientSecret,
          privateKey: credentials.privateKey,
          webhookSecret: credentials.webhookSecret ?? '',
        },
        GithubAppSource.Settings,
        {
          name: registration.name,
          owner: { login: registration.ownerLogin, type: registration.ownerType },
        },
      )
    : null
  fromSettings = { source, config }
  return config
}

function build(
  values: Values,
  source: GithubAppSource,
  about: Pick<GithubAppConfig, 'name' | 'owner'>,
): GithubAppConfig | null {
  if (!values.appId || !values.slug || !values.clientId || !values.clientSecret) return null
  if (!/^\d+$/.test(values.appId) || !/^[a-z0-9-]+$/i.test(values.slug)) return null
  const privateKey = parsePrivateKey(values.privateKey)
  if (!privateKey) return null
  return { ...values, ...about, source, privateKey, webhookSecret: values.webhookSecret || null }
}

/**
 * The PEM GitHub gives, as is, with its line breaks written `\n` (one-line variables), or
 * base64-encoded whole.
 */
export function parsePrivateKey(value: string): KeyObject | null {
  let pem = value.replaceAll('\\n', '\n')
  if (!pem.startsWith('-----BEGIN')) pem = Buffer.from(value, 'base64').toString('utf8')
  try {
    const key = createPrivateKey(pem)
    return key.asymmetricKeyType === 'rsa' ? key : null
  } catch {
    return null
  }
}

/** The page where a user installs the App or changes the repositories it reads. */
export function installUrl(config: GithubAppConfig, state: string): string {
  const url = new URL(`/apps/${config.slug}/installations/new`, GITHUB_URLS.web)
  url.searchParams.set('state', state)
  return url.toString()
}

/** GitHub's authorization page, which comes back to the App's callback URL with a `code`. */
export function authorizeUrl(config: GithubAppConfig, state: string): string {
  const url = new URL('/login/oauth/authorize', GITHUB_URLS.web)
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('state', state)
  url.searchParams.set('allow_signup', 'false')
  return url.toString()
}

/** The App's public page on GitHub. */
export function appPageUrl(slug: string): string {
  return new URL(`/apps/${slug}`, GITHUB_URLS.web).toString()
}

/** The App's settings on GitHub (where it is deleted), when its owner is known. */
export function appSettingsUrl(slug: string, owner: GithubAppConfig['owner']): string | null {
  if (!owner) return null
  const path =
    owner.type === GithubAppOwnerType.Organization
      ? `/organizations/${owner.login}/settings/apps/${slug}`
      : `/settings/apps/${slug}`
  return new URL(path, GITHUB_URLS.web).toString()
}
