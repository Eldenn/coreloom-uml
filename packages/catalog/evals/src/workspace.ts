import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  type AgentContextFile,
  AgentFileKind,
  HOOK_SHEBANG,
  HOOKS_DIRECTORY,
  RULE_PACKS,
  renderAgentContext,
  Target,
} from '../../src/index.ts'
import { git } from './git.ts'
import { Condition, type EvalTask, type FinalState } from './task.ts'

/** The tools the suite runs: the conventions are rendered for both, whichever one a trial runs. */
export const EVAL_TARGETS = [Target.ClaudeCode, Target.Codex] as const

/** The fixture's own name in the rendered `Project` section: says nothing of the task. */
const FIXTURE_PROJECT = 'Fixture'

/** What the catalog renders for a task in a condition: no file for `none`. */
export function conventionFiles(task: EvalTask, condition: Condition) {
  if (condition === Condition.None) return []
  const { files } = renderAgentContext({
    project: { name: FIXTURE_PROJECT, description: null, architectures: [] },
    packs: RULE_PACKS,
    ready: [task.rule, ...(task.context ?? [])],
    rules: [],
    notes: null,
    targets: EVAL_TARGETS,
    roles: [],
  })
  if (condition === Condition.Full) return files
  return files.filter(
    (file) => file.kind === AgentFileKind.Generic || file.kind === AgentFileKind.Pointer,
  )
}

/** Whether a rendered file is a Git hook: it is written with its `#!` line and made executable. */
export const isHookFile = (path: string) => path.startsWith(`${HOOKS_DIRECTORY}/`)

/** A hook's content as a repository holds it: its `#!` line first, added when it has none. */
const withShebang = (content: string) =>
  content.startsWith('#!') ? content : `${HOOK_SHEBANG}\n${content}`

/**
 * Rendered files as a trial's repository holds them, by path: a Git hook with its `#!` line
 * first, as the CLI writes a hook it creates. What the app hands a runner for a condition.
 */
export function workspaceFiles(
  files: readonly Pick<AgentContextFile, 'path' | 'content'>[],
): Record<string, string> {
  return Object.fromEntries(
    files.map((file) => [
      file.path,
      isHookFile(file.path) ? withShebang(file.content) : file.content,
    ]),
  )
}

/**
 * A fresh repository for one trial, under `parent`: the task's files and the rendered
 * conventions committed once on `main`, pushed to a bare `origin` beside it. In the `full`
 * condition the hooks are turned on with the command the catalog recommends. The rendered files
 * live in that temporary repository only, never in this one. `conventions` are the files of the
 * condition by path: by default the task's own rules rendered (`conventionFiles`); the app passes
 * an agent configuration's own files instead. A Git hook (under `.githooks/`) gets its `#!` line
 * when it has none, and is made executable.
 */
export function createWorkspace(
  task: EvalTask,
  condition: Condition,
  parent: string,
  conventions: Readonly<Record<string, string>> = workspaceFiles(conventionFiles(task, condition)),
): FinalState {
  const root = join(parent, 'repo')
  const remote = join(parent, 'origin.git')
  const write = (path: string, content: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  for (const [path, content] of Object.entries(task.files)) write(path, content)
  const hooks: string[] = []
  for (const [path, content] of Object.entries(conventions)) {
    const hook = isHookFile(path)
    write(path, hook ? withShebang(content) : content)
    if (hook) hooks.push(path)
  }
  for (const hook of hooks) chmodSync(join(root, hook), 0o755)

  mkdirSync(root, { recursive: true })
  git(root, ['init', '--quiet', '--initial-branch=main'])
  git(root, ['add', '--all'])
  git(root, ['commit', '--quiet', '--message', 'Initial commit'])
  if (condition === Condition.Full && hooks.length > 0) {
    git(root, ['config', 'core.hooksPath', HOOKS_DIRECTORY])
  }
  git(parent, ['init', '--quiet', '--bare', remote])
  git(root, ['remote', 'add', 'origin', remote])
  git(root, ['push', '--quiet', 'origin', 'main'])
  return { root, base: git(root, ['rev-parse', 'HEAD']), remote }
}

/** `createWorkspace` with the files given first, as the Harbor exporter calls it. */
export function createWorkspaceWithFiles(
  task: EvalTask,
  condition: Condition,
  files: Readonly<Record<string, string>>,
  parent: string,
): FinalState {
  return createWorkspace(task, condition, parent, files)
}
