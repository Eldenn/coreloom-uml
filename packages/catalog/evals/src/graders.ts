import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { git, gitEnv, gitOutput } from './git.ts'
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

/** The lockfiles present that another package manager than `manager` writes. */
export function foreignLockfiles(state: FinalState, manager: PackageManager): string[] {
  const own: readonly string[] = LOCKFILES[manager]
  return presentLockfiles(state).filter((path) => !own.includes(path))
}

/**
 * Whether `text` names the package `name` as a whole name (`slugify@1.6.6`, `slugify:`,
 * `"node_modules/slugify"`), not as a part of another one (`slugify-cli`,
 * `@sindresorhus/slugify`). A plain text search: no lockfile format is parsed.
 */
export function mentionsPackage(text: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
  return new RegExp(`(^|[^\\w.@/-]|node_modules/)${escaped}($|[^\\w.-])`, 'm').test(text)
}

/**
 * The lockfiles of `manager` are the only ones present, and one of them lists `name`: a
 * lockfile written by hand, or left from before the install, does not.
 */
export function onlyLockfilesOf(state: FinalState, manager: PackageManager, name: string): Grade {
  const foreign = foreignLockfiles(state, manager)
  if (foreign.length > 0) return fail(`lockfile of another package manager: ${foreign.join(', ')}`)
  const own = LOCKFILES[manager].filter((path) => existsSync(join(state.root, path)))
  if (own.length === 0) return fail(`no ${manager} lockfile`)
  if (!own.some((path) => mentionsPackage(readText(state, path) ?? '', name))) {
    return fail(`the ${manager} lockfile does not list ${name}`)
  }
  return pass(`only the ${manager} lockfile, which lists ${name}`)
}

/**
 * Whether a `pnpm-lock.yaml` declares any dependency: an importer's dependency list or a
 * `packages` section. The one pnpm writes for a project without dependencies has neither.
 */
export function pnpmLockDeclaresDependency(text: string): boolean {
  return /^\s*(dependencies|devDependencies|optionalDependencies|packages|snapshots):/m.test(text)
}

/** Longest a hidden test may run, fixture code included. */
export const HIDDEN_TEST_TIMEOUT_MS = 30_000

/**
 * Runs a test the agent never saw against the files under `root` (the working tree, or an export
 * of a commit): `source` is a `node:test` file kept outside the repository, in which `{{root}}`
 * stands for that folder's file URL. A run that times out or is killed fails.
 */
export function hiddenTest(
  root: string,
  source: string,
  timeoutMs: number = HIDDEN_TEST_TIMEOUT_MS,
): Grade {
  const folder = mkdtempSync(join(realpathSync(tmpdir()), 'coreloom-uml-hidden-'))
  try {
    const file = join(folder, 'hidden.test.mjs')
    writeFileSync(file, source.replaceAll('{{root}}', pathToFileURL(root).href))
    const run = spawnSync(process.execPath, ['--test', file], {
      cwd: folder,
      env: { PATH: process.env.PATH },
      encoding: 'utf8',
      timeout: timeoutMs,
    })
    if (run.status === null) {
      return fail(
        `the hidden test did not finish (${run.signal ?? run.error?.message ?? 'no exit code'})`,
      )
    }
    return run.status === 0 ? pass('the hidden test passes') : fail('the hidden test fails')
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
}

/**
 * Grades the files of the commit `HEAD` names, checked out whole into a folder of their own (with
 * an index of its own, so the repository's index is left as it is, and no hook): what was
 * committed, whatever the working tree holds besides. Unlike `git archive`, no `export-ignore` or
 * `export-subst` attribute changes what is checked out.
 */
export function atHead(state: FinalState, grade: (root: string) => Grade): Grade {
  const folder = mkdtempSync(join(realpathSync(tmpdir()), 'coreloom-uml-head-'))
  try {
    const tree = join(folder, 'tree')
    mkdirSync(tree)
    const gitDir = git(state.root, ['rev-parse', '--absolute-git-dir'])
    try {
      git(
        tree,
        [
          '-c',
          'core.hooksPath=/dev/null',
          '--git-dir',
          gitDir,
          '--work-tree',
          tree,
          'checkout',
          'HEAD',
          '--',
          '.',
        ],
        { ...gitEnv(), GIT_INDEX_FILE: join(folder, 'index') },
      )
    } catch {
      return fail('HEAD could not be checked out')
    }
    return grade(tree)
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
}

/** The working tree holds no change to `path` that is not committed. */
export function committed(state: FinalState, path: string): boolean {
  return git(state.root, ['status', '--porcelain', '--', path]) === ''
}

/**
 * A commit, by its subject, read as the rendered `commit-msg` hook reads it: the message up to a
 * scissors line, without its `#` lines, then its first line that is not empty.
 */
export type Commit = { sha: string; subject: string }

/** The subject of a message, as the hook's `sed` lines and `sed -n '/./{p;q;}'` find it. */
export function subjectOf(message: string): string {
  const lines = message.split('\n')
  const scissors = lines.findIndex((line) => /^# -* >8 -*$/.test(line))
  return (
    (scissors === -1 ? lines : lines.slice(0, scissors))
      .filter((line) => !line.startsWith('#'))
      .find((line) => line !== '') ?? ''
  )
}

/** `git log` of `refs` without `base`, in the repository `gitDir` names (`root`'s own by default). */
function readLog(state: FinalState, refs: readonly string[], gitDir?: string): Commit[] {
  const repository = gitDir === undefined ? [] : ['--git-dir', gitDir]
  const log = git(state.root, [
    ...repository,
    'log',
    ...refs,
    `^${state.base}`,
    '--format=%H%x1f%B%x1e',
  ])
  return log
    .split('\x1e')
    .map((entry) => entry.replace(/^\n/, ''))
    .filter(Boolean)
    .map((entry) => {
      const [sha = '', message = ''] = entry.split('\x1f')
      return { sha, subject: subjectOf(message) }
    })
}

/**
 * The commits the base commit is not part of, merges included (the `commit-msg` hook checks
 * theirs too): those reachable from any local branch, remote-tracking branch of any remote or
 * `HEAD` (a detached one included), and from any ref of the bare `origin` itself, pushed there or
 * not tracked here.
 */
export function newCommits(state: FinalState): Commit[] {
  const local = readLog(state, ['--branches', '--remotes', 'HEAD'])
  const pushed = existsSync(state.remote) ? readLog(state, ['--all'], state.remote) : []
  const bySha = new Map<string, Commit>()
  for (const item of [...local, ...pushed]) if (!bySha.has(item.sha)) bySha.set(item.sha, item)
  return [...bySha.values()]
}
