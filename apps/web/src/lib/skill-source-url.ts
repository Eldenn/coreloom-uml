/** Same rules as the API (`app/skills/validators/skill-sources-input.ts`). */
const OWNER = /^[A-Za-z0-9-]{1,39}$/
const REPO = /^(?!\.{1,2}$)[A-Za-z0-9._-]{1,100}$/
const SEGMENT = /^(?!\.{1,2}$)[A-Za-z0-9._-]+$/
const PATH_MAX = 200
const GITHUB_URL = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^?#]*)/i

export interface SourceLocation {
  owner: string
  repo: string
  path?: string
}

/**
 * The repository a GitHub source names: a github.com URL of a repository or of one of its folders
 * (`…/tree/<branch>/<folder>`, the branch one segment and never read: the search reads the default
 * branch), or `owner/repo[/folder]`. Null when it is neither.
 */
export function parseSourceUrl(input: string): SourceLocation | null {
  const text = input.trim()
  const url = GITHUB_URL.exec(text)
  let parts = (url ? url[1] : text).split('/').filter(Boolean)
  if (url && parts.length > 2) {
    if (parts[2] !== 'tree' || parts.length < 4) return null
    parts = [parts[0], parts[1], ...parts.slice(4)]
  }
  if (parts.length < 2) return null
  const [owner, rawRepo, ...folder] = parts
  const repo = rawRepo.replace(/\.git$/i, '')
  if (!OWNER.test(owner) || !REPO.test(repo)) return null
  if (!folder.every((segment) => SEGMENT.test(segment))) return null
  const path = folder.join('/')
  if (path.length > PATH_MAX) return null
  return path ? { owner, repo, path } : { owner, repo }
}
