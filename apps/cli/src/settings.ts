import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { CliError } from './errors.ts'

export const API_URL_ENV = 'CORELOOM_UML_API_URL'
export const API_KEY_ENV = 'CORELOOM_UML_API_KEY'

/** Prefix of the account API keys the CLI authenticates with. */
export const API_KEY_PREFIX = 'clu_'

/** The per-user configuration file: `$XDG_CONFIG_HOME/coreloom-uml/config.json`. */
export function userConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  const base = env.XDG_CONFIG_HOME || join(homedir(), '.config')
  return join(base, 'coreloom-uml', 'config.json')
}

type UserConfig = { apiKey?: string }

async function readUserConfig(env: NodeJS.ProcessEnv): Promise<UserConfig> {
  let text: string
  try {
    text = await readFile(userConfigPath(env), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw error
  }
  try {
    const value = JSON.parse(text) as unknown
    return value && typeof value === 'object' ? (value as UserConfig) : {}
  } catch {
    throw new CliError(`${userConfigPath(env)} is not valid JSON.`)
  }
}

/**
 * The API key, from `CORELOOM_UML_API_KEY` then the configuration file. Never from an argument,
 * so that it stays out of the shell history.
 */
export async function resolveApiKey(env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  const fromEnv = env[API_KEY_ENV]?.trim()
  if (fromEnv) return fromEnv
  const stored = (await readUserConfig(env)).apiKey?.trim()
  return stored || null
}

export function assertApiKey(key: string): void {
  if (!key.startsWith(API_KEY_PREFIX) || /\s/.test(key)) {
    throw new CliError(`An API key starts with "${API_KEY_PREFIX}" and has no spaces.`)
  }
}

/** Writes the key to the configuration file, readable by its owner only. */
export async function storeApiKey(key: string, env: NodeJS.ProcessEnv = process.env) {
  assertApiKey(key)
  const path = userConfigPath(env)
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const config = { ...(await readUserConfig(env)), apiKey: key }
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
  // `mode` only applies when the file is created.
  await chmod(path, 0o600)
  return path
}

/**
 * The API base URL, from `--api-url`, then `CORELOOM_UML_API_URL`, then the manifest. There is
 * no default: every instance is self-hosted.
 */
export function resolveApiUrl(
  flag: string | undefined,
  fromManifest: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const raw = flag?.trim() || env[API_URL_ENV]?.trim() || fromManifest?.trim()
  if (!raw) {
    throw new CliError(
      `No API URL: pass --api-url <url> or set ${API_URL_ENV} (the address of your Coreloom UML API).`,
    )
  }
  return normalizeApiUrl(raw)
}

export function normalizeApiUrl(raw: string): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new CliError(`Invalid API URL: ${raw}`)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new CliError(`The API URL must use http or https: ${raw}`)
  }
  if (url.username || url.password) {
    throw new CliError('The API URL must not carry credentials.')
  }
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/+$/, '')
}
