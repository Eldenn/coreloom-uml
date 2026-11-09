import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from '@japa/runner'
import ClaudeCodeCli from '#app/llm-connections/services/claude-code-cli'

/** A stand-in `claude` on PATH that exits at once with code 3, without reading stdin. */
async function stubBinary() {
  const bin = await mkdtemp(join(tmpdir(), 'claude-stub-'))
  const script = join(bin, 'claude')
  await writeFile(script, '#!/bin/sh\nexit 3\n')
  await chmod(script, 0o755)
  const path = process.env.PATH
  process.env.PATH = `${bin}:${path}`
  return async () => {
    process.env.PATH = path
    await rm(bin, { recursive: true, force: true })
  }
}

test.group('Claude Code binary runner', () => {
  test('a binary that exits before reading a large prompt fails the call, not the server', async ({
    assert,
    cleanup,
  }) => {
    cleanup(await stubBinary())
    const dir = await mkdtemp(join(tmpdir(), 'claude-home-'))
    cleanup(() => rm(dir, { recursive: true, force: true }))
    const outcome = await new ClaudeCodeCli().run(['-p'], {
      stdin: 'x'.repeat(4_000_000),
      configDir: dir,
      timeoutMs: 10_000,
    })
    assert.equal(outcome.exitCode, 3)
    assert.isFalse(outcome.timedOut)
  })

  test('an aborted call stops the binary and reads as a timeout', async ({ assert, cleanup }) => {
    cleanup(await stubBinary())
    const dir = await mkdtemp(join(tmpdir(), 'claude-home-'))
    cleanup(() => rm(dir, { recursive: true, force: true }))
    const outcome = await new ClaudeCodeCli().run(['-p'], {
      stdin: '',
      configDir: dir,
      timeoutMs: 10_000,
      signal: AbortSignal.abort(),
    })
    assert.isTrue(outcome.timedOut)
  })
})
