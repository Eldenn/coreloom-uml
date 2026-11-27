import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { git, gitOutput } from './git.ts'
import { type FinalState, type Grade, Verdict } from './task.ts'

/**
 * Readers and checks of a trial's final state: files, the manifest, the lockfiles and the Git
 * history since the base commit. Each one reads the repository as it is; none looks at what the
 * agent ran.
 */

export const pass = (reason: string): Grade => ({ verdict: Verdict.Pass, reason })
export const fail = (reason: string): Grade => ({ verdict: Verdict.Fail, reason })
export const notApplicable = (reason: string): Grade => ({
  verdict: Verdict.NotApplicable,
  reason,
})

/** Every grade must pass; the first one that does not is the answer. */
export function allOf(...grades: readonly Grade[]): Grade {
  return grades.find((grade) => grade.verdict !== Verdict.Pass) ?? pass('every check passed')
}

/** The file as the working tree holds it now, or `null` when it is gone. */
export function readText(state: FinalState, path: string): string | null {
  const file = join(state.root, path)
  return existsSync(file) ? readFileSync(file, 'utf8') : null
}

/** The file as the base commit held it, or `null` when it did not exist. */
export function baseText(state: FinalState, path: string): string | null {
  try {
    return gitOutput(state.root, ['show', `${state.base}:${path}`])
  } catch {
    return null
  }
}

type Manifest = {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  packageManager?: string
}

export function readManifest(state: FinalState): Manifest | null {
  const text = readText(state, 'package.json')
  if (text === null) return null
  try {
    return JSON.parse(text) as Manifest
  } catch {
    return null
  }
}

/** The version range a dependency is declared with, in either list, or `null`. */
export function declaredVersion(state: FinalState, name: string): string | null {
  const manifest = readManifest(state)
  return manifest?.dependencies?.[name] ?? manifest?.devDependencies?.[name] ?? null
}

/** The lockfiles each package manager writes, by the catalog's `tooling.package-manager` ids. */
export const LOCKFILES = {
  pnpm: ['pnpm-lock.yaml'],
  npm: ['package-lock.json', 'npm-shrinkwrap.json'],
  yarn: ['yarn.lock'],
  bun: ['bun.lock', 'bun.lockb'],
} as const

export type PackageManager = keyof typeof LOCKFILES

/** The lockfiles present in the working tree, tracked or not. */
export function presentLockfiles(state: FinalState): string[] {
  return Object.values(LOCKFILES)
    .flat()
    .filter((path) => existsSync(join(state.root, path)))
}

/** The lockfiles of `manager` are the only ones present, and at least one of them is. */
export function onlyLockfilesOf(state: FinalState, manager: PackageManager): Grade {
  const present = presentLockfiles(state)
  const own: readonly string[] = LOCKFILES[manager]
  const foreign = present.filter((path) => !own.includes(path))
  if (foreign.length > 0) return fail(`lockfile of another package manager: ${foreign.join(', ')}`)
  if (!present.some((path) => own.includes(path))) return fail(`no ${manager} lockfile`)
  return pass(`only the ${manager} lockfile`)
}

/** Longest a hidden test may run, fixture code included. */
const HIDDEN_TEST_TIMEOUT_MS = 30_000

/**
 * Runs a test the agent never saw against the working tree: `source` is a `node:test` file kept
 * outside the repository, in which `{{root}}` stands for the repository's file URL.
 */
export function hiddenTest(state: FinalState, source: string): Grade {
  const folder = mkdtempSync(join(realpathSync(tmpdir()), 'coreloom-uml-hidden-'))
  try {
    const file = join(folder, 'hidden.test.mjs')
    writeFileSync(file, source.replaceAll('{{root}}', pathToFileURL(state.root).href))
    const run = spawnSync(process.execPath, ['--test', file], {
      cwd: folder,
      env: { PATH: process.env.PATH },
      encoding: 'utf8',
      timeout: HIDDEN_TEST_TIMEOUT_MS,
    })
    return run.status === 0 ? pass('the hidden test passes') : fail('the hidden test fails')
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
}

/** The working tree holds no change to `path` that is not committed. */
export function committed(state: FinalState, path: string): boolean {
  return git(state.root, ['status', '--porcelain', '--', path]) === ''
}

export type Commit = { sha: string; subject: string; body: string }

/** The commits reachable from any branch, local or pushed, that the base commit is not part of. */
export function newCommits(state: FinalState): Commit[] {
  const log = git(state.root, [
    'log',
    '--branches',
    '--remotes',
    `^${state.base}`,
    '--format=%H%x00%s%x00%b%x1e',
  ])
  return log
    .split('\x1e')
    .map((entry) => entry.replace(/^\n/, ''))
    .filter(Boolean)
    .map((entry) => {
      const [sha = '', subject = '', body = ''] = entry.split('\x00')
      return { sha, subject, body: body.trim() }
    })
}

/** Paths changed between the base commit and the working tree, committed or not, new or not. */
export function changedPaths(state: FinalState): string[] {
  const tracked = git(state.root, ['diff', '--name-only', state.base])
  const untracked = git(state.root, ['ls-files', '--others', '--exclude-standard'])
  return [...new Set([...tracked.split('\n'), ...untracked.split('\n')].filter(Boolean))].sort()
}
