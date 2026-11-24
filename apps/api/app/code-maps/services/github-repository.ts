/**
 * The GitHub repositories the server maps itself. Only `github.com` is accepted, and the clone
 * URL is built from the parts read here, so nothing typed reaches git as is.
 */

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/
const NAME = /^[A-Za-z0-9._-]{1,100}$/
const BRANCH = /^[A-Za-z0-9._/-]{1,200}$/

export type GithubRepository = {
  owner: string
  name: string
  /** `https://github.com/<owner>/<name>`, what the map keeps as its repository. */
  url: string
}

/**
 * `https://github.com/acme/shop`, with or without the scheme, `www.`, a `.git` suffix or a
 * trailing slash. Null for anything else: another host, credentials, a port, a query, a path
 * deeper than the repository.
 */
export function parseGithubRepository(input: string): GithubRepository | null {
  const value = input.trim()
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (url.hostname !== 'github.com' && url.hostname !== 'www.github.com') return null
  if (url.username || url.password || url.port || url.search || url.hash) return null
  const parts = url.pathname.replace(/\/+$/, '').split('/').slice(1)
  if (parts.length !== 2) return null
  const [owner, rawName] = parts as [string, string]
  const name = rawName.replace(/\.git$/, '')
  if (!OWNER.test(owner) || !NAME.test(name) || name === '.' || name === '..') return null
  return { owner, name, url: `https://github.com/${owner}/${name}` }
}

/** A branch name git accepts and that cannot be read as an option or a path trick. */
export function isValidBranch(value: string): boolean {
  return (
    BRANCH.test(value) &&
    !/^[-/.]/.test(value) &&
    !/(?:\/|\.|\.lock)$/.test(value) &&
    !value.includes('..') &&
    !value.includes('//') &&
    !value.includes('/.')
  )
}
