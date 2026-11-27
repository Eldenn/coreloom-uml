import { execFileSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Who made the fixture's first commit, and when: the same base commit on every machine. */
export const FIXTURE_AUTHOR = { name: 'Fixture', email: 'fixture@example.com' } as const
const FIXTURE_DATE = '2026-01-01T00:00:00Z'

let emptyHome: string | null = null

/** An empty folder of this process, never written to and removed when it exits. */
function isolatedHome(): string {
  if (emptyHome === null) {
    const folder = mkdtempSync(join(realpathSync(tmpdir()), 'coreloom-uml-git-home-'))
    process.once('exit', () => rmSync(folder, { recursive: true, force: true }))
    emptyHome = folder
  }
  return emptyHome
}

/**
 * Git with none of the machine's own setup, so a workspace and its grades are the same wherever
 * they run: no global or system configuration file (so no global hooks, signing or aliases),
 * `HOME` and `XDG_CONFIG_HOME` on an empty folder (so neither `~/.config/git/ignore` nor
 * `~/.config/git/attributes` applies), an empty template folder, and no other variable of this
 * process.
 */
export function gitEnv(): NodeJS.ProcessEnv {
  const home = isolatedHome()
  return {
    PATH: process.env.PATH,
    HOME: home,
    XDG_CONFIG_HOME: home,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TEMPLATE_DIR: home,
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

/** Runs git in `cwd` and answers its output as bytes (an archive, for one). */
export function gitBytes(cwd: string, args: readonly string[]): Buffer {
  return execFileSync('git', args, {
    cwd,
    env: gitEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  })
}
