import { createPrivateKey, type KeyObject } from 'node:crypto'
import { GITHUB_URLS } from '#app/github/constants/github'
import env from '#start/env'

/**
 * The GitHub App's settings, all from the environment. The App is on only when every one of them
 * is set; otherwise its routes answer 404 and the webhook refuses every delivery.
 */
export type GithubAppConfig = {
  appId: string
  slug: string
  clientId: string
  clientSecret: string
  privateKey: KeyObject
  webhookSecret: string
}

let cached: { source: string; config: GithubAppConfig | null } | undefined

/** The App's settings, or null when one of them is missing or the private key does not parse. */
export function githubAppConfig(): GithubAppConfig | null {
  const values = {
    appId: env.get('GITHUB_APP_ID')?.trim() ?? '',
    slug: env.get('GITHUB_APP_SLUG')?.trim() ?? '',
    clientId: env.get('GITHUB_APP_CLIENT_ID')?.trim() ?? '',
    clientSecret: env.get('GITHUB_APP_CLIENT_SECRET')?.trim() ?? '',
    privateKey: env.get('GITHUB_APP_PRIVATE_KEY')?.trim() ?? '',
    webhookSecret: env.get('GITHUB_APP_WEBHOOK_SECRET') ?? '',
  }
  const source = JSON.stringify(values)
  if (cached?.source === source) return cached.config
  cached = { source, config: build(values) }
  return cached.config
}

function build(values: Record<keyof GithubAppConfig, string>): GithubAppConfig | null {
  if (Object.values(values).some((value) => value === '')) return null
  if (!/^\d+$/.test(values.appId) || !/^[a-z0-9-]+$/i.test(values.slug)) return null
  const privateKey = parsePrivateKey(values.privateKey)
  if (!privateKey) return null
  return { ...values, privateKey }
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
