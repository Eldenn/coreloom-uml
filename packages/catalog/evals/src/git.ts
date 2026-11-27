import { execFileSync } from 'node:child_process'

/** Who made the fixture's first commit, and when: the same base commit on every machine. */
const FIXTURE_AUTHOR = { name: 'Fixture', email: 'fixture@example.com' } as const
const FIXTURE_DATE = '2026-01-01T00:00:00Z'

/**
 * The home Git is given: a fixed path that does not exist (the convention of accounts without a
 * home), so there is nothing to create, nothing to leave behind and nothing to read there. As the
 * template folder too, `git init` warns that it found no template and copies none.
 */
export const NO_HOME = '/nonexistent/coreloom-uml-evals'

/**
 * Git with none of the machine's own setup, so a workspace and its grades are the same wherever
 * they run: no global or system configuration file (so no global hooks, signing or aliases),
 * `HOME` and `XDG_CONFIG_HOME` on a path that does not exist (so neither `~/.config/git/ignore`
 * nor `~/.config/git/attributes` applies), no template, and no other variable of this process.
 */
export function gitEnv(): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    HOME: NO_HOME,
    XDG_CONFIG_HOME: NO_HOME,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TEMPLATE_DIR: NO_HOME,
    GIT_TERMINAL_PROMPT: '0',
    GIT_AUTHOR_NAME: FIXTURE_AUTHOR.name,
    GIT_AUTHOR_EMAIL: FIXTURE_AUTHOR.email,
    GIT_COMMITTER_NAME: FIXTURE_AUTHOR.name,
    GIT_COMMITTER_EMAIL: FIXTURE_AUTHOR.email,
    GIT_AUTHOR_DATE: FIXTURE_DATE,
    GIT_COMMITTER_DATE: FIXTURE_DATE,
  }
}

/**
 * What a repository's own configuration could make Git run while it is read: the agent wrote
 * that configuration, and the graders read the repository as root. Turned off on every command
 * line: no file system monitor, no hook, no pager, no attributes file of ours (the graders never run
 * `git diff`, whose `diff.external` cannot be emptied).
 */
const FIXED_OVERRIDES = [
  'core.fsmonitor=false',
  'core.hooksPath=/dev/null',
  'core.pager=cat',
  'core.attributesFile=/dev/null',
] as const

/** The keys of a driver (`filter.<name>.…`, `diff.<name>.…`) that name a program to run. */
const DRIVER_KEY = /^(filter|diff)\.(.+)\.(clean|smudge|process|textconv|command)$/

/**
 * `-c` options that empty every program a filter or diff driver of the repository names (and make
 * its filters optional), so a `.gitattributes` the agent wrote runs nothing on checkout or status.
 * Reading the configuration runs nothing. None when `gitDir` is no repository.
 */
function driverOverrides(cwd: string, gitDir: string | undefined, env: NodeJS.ProcessEnv) {
  let listed: string
  try {
    listed = execFileSync(
      'git',
      [
        ...(gitDir === undefined ? [] : ['--git-dir', gitDir]),
        'config',
        '--null',
        '--name-only',
        '--get-regexp',
        '^(filter|diff)\\.',
      ],
      { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
  } catch {
    return []
  }
  const options: string[] = []
  for (const key of new Set(listed.split('\0').filter(Boolean))) {
    const match = DRIVER_KEY.exec(key)
    if (!match) continue
    options.push('-c', `${key}=`)
    if (match[1] === 'filter') options.push('-c', `filter.${match[2]}.required=false`)
  }
  return options
}

/** Git's global options that take the next argument as their value. */
const VALUED_OPTIONS = new Set(['-c', '-C', '--git-dir', '--work-tree', '--namespace'])

/** The subcommand of a Git command line, after its global options. */
function subcommandOf(args: readonly string[]): string | undefined {
  for (let index = 0; index < args.length; index++) {
    const arg = args[index] as string
    if (VALUED_OPTIONS.has(arg)) index++
    else if (!arg.startsWith('-')) return arg
  }
  return undefined
}

/** Runs git in `cwd` and answers its output without the trailing line break. */
export function git(cwd: string, args: readonly string[], env: NodeJS.ProcessEnv = gitEnv()) {
  return gitOutput(cwd, args, env).trimEnd()
}

/**
 * Runs git in `cwd` and answers its output byte for byte (a file's content, for one), with every
 * program the repository's own configuration names turned off (`FIXED_OVERRIDES`, the drivers).
 */
export function gitOutput(
  cwd: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv = gitEnv(),
): string {
  const at = args.indexOf('--git-dir')
  const gitDir = at === -1 ? undefined : args[at + 1]
  // Reading or writing a setting runs nothing, and must see the repository's own values.
  const overrides =
    subcommandOf(args) === 'config'
      ? []
      : [
          ...FIXED_OVERRIDES.flatMap((option) => ['-c', option]),
          ...driverOverrides(cwd, gitDir, env),
        ]
  return execFileSync('git', [...overrides, ...args], {
    cwd,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}
