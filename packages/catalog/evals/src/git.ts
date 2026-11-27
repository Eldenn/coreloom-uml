import { execFileSync } from 'node:child_process'

/** Who made the fixture's first commit, and when: the same base commit on every machine. */
export const FIXTURE_AUTHOR = { name: 'Fixture', email: 'fixture@example.com' } as const
const FIXTURE_DATE = '2026-01-01T00:00:00Z'

/**
 * Git with none of the machine's own configuration (global hooks, signing, templates), so a
 * workspace and its grades are the same wherever they run.
 */
export function gitEnv(): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
    GIT_AUTHOR_NAME: FIXTURE_AUTHOR.name,
    GIT_AUTHOR_EMAIL: FIXTURE_AUTHOR.email,
    GIT_COMMITTER_NAME: FIXTURE_AUTHOR.name,
    GIT_COMMITTER_EMAIL: FIXTURE_AUTHOR.email,
    GIT_AUTHOR_DATE: FIXTURE_DATE,
    GIT_COMMITTER_DATE: FIXTURE_DATE,
  }
}

/** Runs git in `cwd` and answers its output without the trailing line break. */
export function git(cwd: string, args: readonly string[], env: NodeJS.ProcessEnv = gitEnv()) {
  return gitOutput(cwd, args, env).trimEnd()
}

/** Runs git in `cwd` and answers its output byte for byte (a file's content, for one). */
export function gitOutput(
  cwd: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv = gitEnv(),
): string {
  return execFileSync('git', args, {
    cwd,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}
