import { lstat } from 'node:fs/promises'
import { join, posix, win32 } from 'node:path'
import { CliError } from './errors.ts'

/**
 * Checks a path the API asks the CLI to write, and returns it under `root`. It must be relative,
 * already normalized, inside `root`, and no part of it may be a symbolic link: a server, or
 * whoever controls one, must never make the CLI write outside the repository.
 */
export async function resolveSafePath(root: string, path: string): Promise<string> {
  const refuse = (reason: string) => new CliError(`Refused path "${path}": ${reason}.`)

  if (path === '' || path.includes('\0')) throw refuse('empty or invalid')
  if (path.includes('\\')) throw refuse('backslashes are not allowed')
  if (posix.isAbsolute(path) || win32.isAbsolute(path)) throw refuse('it is absolute')
  const segments = path.split('/')
  if (segments.some((segment) => segment === '..')) throw refuse('it leaves the repository')
  if (
    posix.normalize(path) !== path ||
    segments.some((segment) => segment === '' || segment === '.')
  ) {
    throw refuse('it is not normalized')
  }

  let current = root
  for (const segment of segments) {
    current = join(current, segment)
    try {
      if ((await lstat(current)).isSymbolicLink()) throw refuse('it goes through a symbolic link')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') break
      throw error
    }
  }
  return join(root, ...segments)
}
