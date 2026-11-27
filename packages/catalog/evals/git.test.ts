/**
 * The graders read a repository the agent configured, as root in the trial's sandbox: nothing its
 * own configuration names (a file system monitor, a filter or diff driver, a hook) may run then.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { gitEnv } from './src/git.ts'
import { atHead, committed, newCommits, pass } from './src/graders.ts'
import { Condition } from './src/task.ts'
import { createWorkspace } from './src/workspace.ts'
import { commitMessagesConventional } from './tasks/commit-messages.ts'

const tmp = mkdtempSync(join(realpathSync(tmpdir()), 'coreloom-uml-evals-git-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

/** Git as the agent runs it: its own configuration applies, nothing turned off. */
const raw = (cwd: string, args: readonly string[]) =>
  execFileSync('git', args, { cwd, env: gitEnv(), stdio: 'ignore' })

describe('git as the graders run it', () => {
  it('runs no program the repository names: fsmonitor, filters, diff drivers, hooks', () => {
    const parent = join(tmp, 'hostile')
    mkdirSync(parent)
    const state = createWorkspace(commitMessagesConventional, Condition.None, parent)
    const marker = join(tmp, 'ran')
    const touch = `sh -c 'touch ${marker}; cat'`
    writeFileSync(join(state.root, '.gitattributes'), '* filter=evil diff=evil\n')
    raw(state.root, ['add', '.gitattributes'])
    raw(state.root, ['commit', '-qm', 'fix: name the drivers'])
    raw(state.root, ['config', 'core.fsmonitor', `touch ${marker}`])
    raw(state.root, ['config', 'filter.evil.smudge', touch])
    raw(state.root, ['config', 'filter.evil.clean', touch])
    raw(state.root, ['config', 'filter.evil.process', `touch ${marker}`])
    raw(state.root, ['config', 'filter.evil.required', 'true'])
    raw(state.root, ['config', 'diff.evil.textconv', `touch ${marker}`])
    raw(state.root, ['config', 'core.hooksPath', join(tmp, 'hooks')])
    writeFileSync(join(state.root, 'src', 'sum.js'), 'export const sum = () => 0\n')
    // The control: Git as the agent runs it does run them.
    try {
      raw(state.root, ['status', '--porcelain'])
    } catch {}
    expect(existsSync(marker)).toBe(true)
    rmSync(marker, { force: true })

    expect(committed(state, 'src/sum.js')).toBe(false)
    expect(atHead(state, () => pass('read'))).toEqual(pass('read'))
    expect(newCommits(state)).toHaveLength(1)
    expect(existsSync(marker)).toBe(false)
  })
})
