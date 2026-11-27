import { chmodSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  AgentFileKind,
  HOOK_SHEBANG,
  HOOKS_PATH_COMMAND,
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
export function createWorkspace(
  task: EvalTask,
  condition: Condition,
  parent: string = mkdtempSync(join(realpathSync(tmpdir()), 'coreloom-uml-evals-')),
): FinalState {
  const root = join(parent, 'repo')
  const remote = join(parent, 'origin.git')
  const write = (path: string, content: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  for (const [path, content] of Object.entries(task.files)) write(path, content)
  const hooks: string[] = []
  for (const file of conventionFiles(task, condition)) {
    const hook = file.path.startsWith('.githooks/')
    write(file.path, hook ? `${HOOK_SHEBANG}\n${file.content}` : file.content)
    if (hook) hooks.push(file.path)
  }
  for (const hook of hooks) chmodSync(join(root, hook), 0o755)

  mkdirSync(root, { recursive: true })
  git(root, ['init', '--quiet', '--initial-branch=main'])
  git(root, ['add', '--all'])
  git(root, ['commit', '--quiet', '--message', 'Initial commit'])
  if (condition === Condition.Full && hooks.length > 0) {
    git(root, HOOKS_PATH_COMMAND.split(' ').slice(1))
  }
  git(parent, ['init', '--quiet', '--bare', remote])
  git(root, ['remote', 'add', 'origin', remote])
  git(root, ['push', '--quiet', 'origin', 'main'])
  return { root, base: git(root, ['rev-parse', 'HEAD']), remote }
}
