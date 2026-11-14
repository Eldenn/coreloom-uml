import type { CommandRunner } from './run-command.ts'

/** What the CLI reads from the repository to label a code map. Each part may be missing. */
export type GitInfo = {
  /** The `origin` remote as a web address, without any user name or password. */
  repositoryUrl?: string
  branch?: string
  commit?: string
  /** Whether the working tree has changes that are not committed. */
  dirty: boolean
}

const COMMIT = /^[0-9a-f]{7,64}$/i
/** What graphify and the CLI write themselves: not a change to the code. */
const OWN_FILES = /^"?(?:\.graphifyignore|graphify-out\/)/

/**
 * Reads the branch, the commit and the `origin` remote of the repository at `cwd`, best effort:
 * outside a Git repository (or without Git) everything is missing. In a detached checkout, as in
 * CI, the branch comes from GitHub Actions' `GITHUB_HEAD_REF` or `GITHUB_REF_NAME`.
 */
export async function readGitInfo(
  cwd: string,
  run: CommandRunner,
  env: NodeJS.ProcessEnv = process.env,
): Promise<GitInfo> {
  const git = async (...args: string[]) => {
    const result = await run('git', args, { cwd, timeoutMs: 30_000 })
    return result.code === 0 ? result.stdout.trim() : null
  }

  const commit = await git('rev-parse', 'HEAD')
  if (commit === null) return { dirty: false }
  const changes = (await git('status', '--porcelain')) ?? ''
  const info: GitInfo = {
    dirty: changes.split('\n').some((line) => line.trim() && !OWN_FILES.test(line.slice(3))),
  }
  if (COMMIT.test(commit)) info.commit = commit.toLowerCase()

  const ref = await git('rev-parse', '--abbrev-ref', 'HEAD')
  const branch =
    ref && ref !== 'HEAD' ? ref : env.GITHUB_HEAD_REF?.trim() || env.GITHUB_REF_NAME?.trim()
  if (branch) info.branch = branch

  const remote = await git('remote', 'get-url', 'origin')
  const repositoryUrl = remote ? remoteWebUrl(remote) : null
  if (repositoryUrl) info.repositoryUrl = repositoryUrl
  return info
}

/**
 * The web address of a Git remote: `git@github.com:acme/app.git`, `ssh://git@host/acme/app` and
 * `https://token@github.com/acme/app.git` all give `https://<host>/acme/app`. A user name or a
 * password (a clone URL can hold a token) is never kept. `null` for a local path or anything else.
 */
export function remoteWebUrl(remote: string): string | null {
  const value = remote.trim()
  const scp = /^[\w.-]+@([\w.-]+):(?!\/)(.+)$/.exec(value)
  let scheme = 'https'
  let host: string
  let path: string
  if (scp?.[1] && scp[2]) {
    host = scp[1]
    path = scp[2]
  } else {
    let url: URL
    try {
      url = new URL(value)
    } catch {
      return null
    }
    if (!['https:', 'http:', 'ssh:', 'git:'].includes(url.protocol) || !url.hostname) return null
    // Over SSH the port is the SSH server's, not the web server's.
    host = url.protocol === 'https:' || url.protocol === 'http:' ? url.host : url.hostname
    if (url.protocol === 'http:') scheme = 'http'
    path = url.pathname
  }
  path = path
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/, '')
  if (!path || path.split('/').some((segment) => segment === '' || segment === '..')) return null
  try {
    return new URL(`${scheme}://${host}/${path}`).toString()
  } catch {
    return null
  }
}
