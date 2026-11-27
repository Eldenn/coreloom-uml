import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
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

/**
 * A fresh repository for one trial, under `parent`: the task's files and the rendered
 * conventions committed once on `main`, pushed to a bare `origin` beside it. In the `full`
 * condition the hooks are turned on with the command the catalog recommends. The rendered files
 * live in that temporary repository only, never in this one.
 */
export function createWorkspace(task: EvalTask, condition: Condition, parent: string): FinalState {
  const files = Object.fromEntries(
    conventionFiles(task, condition).map((file) => [file.path, file.content]),
  )
  return createWorkspaceWithFiles(task, condition, files, parent)
}

/**
 * The same repository with convention files given by the caller (a configuration's own rendered
 * files, by path) instead of the task's rule rendered here. A Git hook (under `.githooks/`) is
 * written as the catalog renders it, its `#!` line added when it has none, and made executable.
 */
export function createWorkspaceWithFiles(
  task: EvalTask,
  condition: Condition,
  files: Readonly<Record<string, string>>,
  parent: string,
): FinalState {
  const root = join(parent, 'repo')
  const remote = join(parent, 'origin.git')
  const write = (path: string, content: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  for (const [path, content] of Object.entries(task.files)) write(path, content)
  const hooks: string[] = []
  for (const [path, content] of Object.entries(files)) {
    const hook = path.startsWith(`${HOOKS_DIRECTORY}/`)
    write(path, hook && !content.startsWith('#!') ? `${HOOK_SHEBANG}\n${content}` : content)
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
