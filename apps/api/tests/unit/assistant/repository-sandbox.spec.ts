import { test } from '@japa/runner'
import { CommandExitError, TimeoutError } from 'e2b'
import { REPOSITORY_SANDBOX } from '#app/assistant/constants/repository'
import {
  CLONE,
  CLONE_AT,
  cloneCredential,
  cloneSecretFile,
  MAP,
  READ,
  SHELL,
  TERMINAL,
  writeCloneCredential,
} from '#app/assistant/services/repository-commands'
import { handle, pausedWith } from '#app/assistant/services/repository-sandbox'

/**
 * `handle`, around a stand-in for E2B's sandbox that notes what reaches it: a secret written to
 * the sandbox is refused afterwards in any command line or environment value, and such a run
 * never reaches E2B. E2B is never reached.
 */

const TOKEN = 'ghs_witness0123456789abcdefghijklmnopqrstuv'
const root = REPOSITORY_SANDBOX.root

function fakeSandbox(answer: () => Promise<{ exitCode: number; stdout: string }>, fresh = true) {
  const calls = {
    runs: [] as { command: string; envs: Record<string, string> }[],
    writes: [] as { path: string; content: string }[],
  }
  const sandbox = {
    sandboxId: 'sbx-guard',
    commands: {
      run: async (command: string, options: { envs: Record<string, string> }) => {
        calls.runs.push({ command, envs: options.envs })
        return answer()
      },
    },
    files: {
      write: async (path: string, content: string) => {
        calls.writes.push({ path, content })
        return { name: 'x', path, type: 'file' }
      },
    },
    updateNetwork: async () => {},
    setTimeout: async () => {},
    pause: async () => true,
  }
  return { opened: handle(sandbox as never, { fresh }), calls }
}

const ok = async () => ({ exitCode: 0, stdout: 'done\n' })

test.group('repository sandbox secret guard', () => {
  test('a secret written to the sandbox is refused in any later line or environment', async ({
    assert,
  }) => {
    const { opened, calls } = fakeSandbox(ok)
    assert.isTrue(await writeCloneCredential(opened, root, TOKEN))
    assert.deepEqual(calls.writes, [
      { path: cloneSecretFile(root), content: cloneCredential(TOKEN) },
    ])

    const refused = {
      exitCode: REPOSITORY_SANDBOX.refusedExitCode,
      output: REPOSITORY_SANDBOX.refusedOutput,
    }
    const header = `Authorization: Basic ${cloneCredential(TOKEN)}`
    assert.deepEqual(
      await opened.run(CLONE, { REPO_ROOT: root, GIT_CONFIG_VALUE_0: header }),
      refused,
    )
    assert.deepEqual(await opened.run(READ, { REPO_ROOT: root, READ_PATH: `x${TOKEN}` }), refused)
    assert.deepEqual(await opened.run(`echo ${cloneCredential(TOKEN)}`, {}), refused)
    assert.deepEqual(await opened.run('true', { [TOKEN]: '1' }), refused)
    // None of those reached E2B; a clean line does.
    assert.lengthOf(calls.runs, 0)
    assert.deepEqual(await opened.run(CLONE, { REPO_ROOT: root }), {
      exitCode: 0,
      output: 'done\n',
    })
    assert.lengthOf(calls.runs, 1)
  })

  test('a secret is taken by a new sandbox only, until a command but the clone ran', async ({
    assert,
  }) => {
    // From `resume`: refused, and nothing reaches E2B.
    const resumed = fakeSandbox(ok, false)
    assert.isFalse(await writeCloneCredential(resumed.opened, root, TOKEN))
    assert.lengthOf(resumed.calls.writes, 0)
    // Still refused in a later line, even though it was never written.
    assert.equal(
      (await resumed.opened.run('true', { PROBE: TOKEN })).exitCode,
      REPOSITORY_SANDBOX.refusedExitCode,
    )

    // MAP (graphify parsing the repository's code) and READ switch it off as well, by
    // construction rather than by the order of the flows.
    for (const command of [SHELL, TERMINAL, MAP, READ]) {
      const { opened, calls } = fakeSandbox(ok)
      // A clone, or a second try of it, leaves it taking one.
      assert.isTrue(await writeCloneCredential(opened, root, TOKEN))
      await opened.run(CLONE, { REPO_ROOT: root })
      assert.isTrue(await writeCloneCredential(opened, root, `${TOKEN}-retry`))
      await opened.run(CLONE_AT, { REPO_ROOT: root })
      await opened.run(command, { REPO_ROOT: root, SHELL_COMMAND: 'sleep 999 &' })
      assert.isFalse(await writeCloneCredential(opened, root, `${TOKEN}-next`))
      assert.lengthOf(calls.writes, 2)
    }

    // A command that fails, or never answers, may still have left something running.
    const failed = fakeSandbox(async () => {
      throw new Error('gone')
    })
    await failed.opened.run(SHELL, { REPO_ROOT: root, SHELL_COMMAND: 'true' })
    assert.isFalse(await writeCloneCredential(failed.opened, root, TOKEN))
    assert.lengthOf(failed.calls.writes, 0)
  })

  test('the refusal is a code no shell answers, with a sentence that holds no secret', ({
    assert,
  }) => {
    const code = REPOSITORY_SANDBOX.refusedExitCode
    // Not bash's own (126 to 128), nor 128 + a Linux signal (1 to 64).
    assert.isTrue(code > 128 + 64 && code <= 255)
    assert.notInclude(REPOSITORY_SANDBOX.refusedOutput, TOKEN)
    assert.match(REPOSITORY_SANDBOX.refusedOutput, /^Refused: /)
  })

  test('a sandbox given no secret runs everything it is given', async ({ assert }) => {
    const { opened, calls } = fakeSandbox(ok)
    assert.deepEqual(await opened.run(READ, { READ_PATH: TOKEN }), {
      exitCode: 0,
      output: 'done\n',
    })
    assert.lengthOf(calls.runs, 1)
  })

  test('keeps the exit codes of a run', async ({ assert }) => {
    const failed = fakeSandbox(async () => {
      throw new CommandExitError({ exitCode: 3, stdout: 'partial', stderr: '', error: undefined })
    })
    assert.deepEqual(await failed.opened.run('false', {}), { exitCode: 3, output: 'partial' })
    const slow = fakeSandbox(async () => {
      throw new TimeoutError('slow')
    })
    assert.deepEqual(await slow.opened.run('sleep 9', {}), { exitCode: 124, output: '' })
    const gone = fakeSandbox(async () => {
      throw new Error('gone')
    })
    assert.deepEqual(await gone.opened.run('true', {}), {
      exitCode: REPOSITORY_SANDBOX.goneExitCode,
      output: '',
    })
  })
})

test.group('repository sandbox paused list', () => {
  /** E2B's paginator, over `pages`, without filtering anything: an install ignoring the query. */
  function fakePages(
    pages: { sandboxId: string; state: 'running' | 'paused'; metadata: Record<string, string> }[][],
  ) {
    const left = [...pages]
    return {
      get hasNext() {
        return left.length > 0
      },
      nextItems: async () => left.shift() ?? [],
    }
  }

  test('keeps only the paused sandboxes with every requested metadata entry', async ({
    assert,
  }) => {
    const tag = { purpose: 'assistant-conversation', conversationId: '7' }
    const ids = await pausedWith(
      fakePages([
        [
          { sandboxId: 'paused-tagged', state: 'paused', metadata: { ...tag, extra: 'x' } },
          // Tagged, but still running (in the middle of its clone): never killed.
          { sandboxId: 'running-tagged', state: 'running', metadata: tag },
          { sandboxId: 'paused-untagged', state: 'paused', metadata: {} },
        ],
        [
          // An import's or a reading's, or another conversation's.
          {
            sandboxId: 'paused-other-purpose',
            state: 'paused',
            metadata: { ...tag, purpose: 'x' },
          },
          {
            sandboxId: 'paused-other-id',
            state: 'paused',
            metadata: { ...tag, conversationId: '8' },
          },
          { sandboxId: 'paused-half', state: 'paused', metadata: { purpose: tag.purpose } },
          { sandboxId: 'paused-tagged-2', state: 'paused', metadata: tag },
        ],
      ]),
      tag,
    )
    assert.deepEqual(ids, ['paused-tagged', 'paused-tagged-2'])
  })

  test('an empty list gives no id', async ({ assert }) => {
    assert.deepEqual(await pausedWith(fakePages([]), { purpose: 'assistant-conversation' }), [])
  })
})
