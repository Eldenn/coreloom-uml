/**
 * The grading entry a trial's sandbox runs (`grade-cli.ts`), run here with this machine's Node as
 * the sandbox's runs it (TypeScript source, type stripping), and the workspace built from files
 * handed in by the app rather than the task's own render.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { HOOK_SHEBANG } from '../src/index.ts'
import { git } from './src/git.ts'
import { findEvalTask, gradeTrial } from './src/grade.ts'
import { Condition, Verdict } from './src/task.ts'
import { conventionFiles, createWorkspace, workspaceFiles } from './src/workspace.ts'
import { commitMessagesConventional } from './tasks/commit-messages.ts'

const tmp = mkdtempSync(join(realpathSync(tmpdir()), 'coreloom-uml-evals-grade-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'src', 'grade-cli.ts')
let trial = 0
const folder = () => {
  const parent = join(tmp, `trial-${String(trial++)}`)
  mkdirSync(parent)
  return parent
}

describe('grading a trial', () => {
  it('finds a task by its id', () => {
    expect(findEvalTask(commitMessagesConventional.id)).toBe(commitMessagesConventional)
    expect(findEvalTask('no-such-task')).toBeNull()
  })

  it('grades the reference solution as passing, from the command line', () => {
    const task = commitMessagesConventional
    const state = createWorkspace(task, Condition.None, folder())
    task.reference(state)
    const run = spawnSync(process.execPath, [CLI, task.id, state.root, state.base, state.remote], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH },
    })
    expect(run.status).toBe(0)
    const grades = JSON.parse(run.stdout)
    expect(grades.success.verdict).toBe(Verdict.Pass)
    expect(grades.compliance.verdict).toBe(Verdict.Pass)
    expect(gradeTrial(task, state)).toEqual(grades)
  })

  it('refuses arguments it cannot read', () => {
    const run = spawnSync(process.execPath, [CLI, 'no-such-task', '/x', 'abc', '/y'], {
      encoding: 'utf8',
    })
    expect(run.status).toBe(2)
    expect(run.stdout).toBe('')
  })

  it('fails a grader that cannot read the state instead of throwing', () => {
    const grades = gradeTrial(commitMessagesConventional, {
      root: join(tmp, 'missing'),
      base: '0'.repeat(40),
      remote: join(tmp, 'missing.git'),
    })
    expect(grades.success.verdict).toBe(Verdict.Fail)
  })
})

describe('a workspace from files handed in', () => {
  it('writes them, hooks executable with their #! line, and turns the hooks on for full', () => {
    const task = commitMessagesConventional
    const files = workspaceFiles(conventionFiles(task, Condition.Full))
    const hook = Object.keys(files).find((path) => path.startsWith('.githooks/'))
    expect(hook).toBeDefined()
    expect(files[hook as string]?.startsWith(`${HOOK_SHEBANG}\n`)).toBe(true)

    const state = createWorkspace(task, Condition.Full, folder(), {
      ...files,
      'AGENTS.md': '# Own conventions\n',
    })
    expect(readFileSync(join(state.root, 'AGENTS.md'), 'utf8')).toBe('# Own conventions\n')
    expect(existsSync(join(state.root, hook as string))).toBe(true)
    expect(git(state.root, ['config', 'core.hooksPath'])).toBe('.githooks')
  })

  it('writes nothing of the conventions when none are handed in', () => {
    const state = createWorkspace(commitMessagesConventional, Condition.Full, folder(), {})
    expect(existsSync(join(state.root, 'AGENTS.md'))).toBe(false)
  })
})
