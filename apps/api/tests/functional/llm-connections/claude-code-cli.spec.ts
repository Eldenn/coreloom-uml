import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from '@japa/runner'
import ClaudeCodeCli from '#app/llm-connections/services/claude-code-cli'

/** A stand-in `claude` on PATH; by default it exits at once with code 3, without reading stdin. */
async function stubBinary(body = 'exit 3') {
  const bin = await mkdtemp(join(tmpdir(), 'claude-stub-'))
  const script = join(bin, 'claude')
  await writeFile(script, `#!/bin/sh\n${body}\n`)
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

  test('too much output fails the call without reading as a timeout', async ({
    assert,
    cleanup,
  }) => {
    cleanup(await stubBinary('head -c 2000000 /dev/zero'))
    const dir = await mkdtemp(join(tmpdir(), 'claude-home-'))
    cleanup(() => rm(dir, { recursive: true, force: true }))
    const outcome = await new ClaudeCodeCli().run(['-p'], {
      stdin: '',
      configDir: dir,
      timeoutMs: 10_000,
    })
    assert.isNull(outcome.exitCode)
    assert.isFalse(outcome.timedOut)
  })

  test('reads a sign-in URL printed over several chunks in full', async ({ assert, cleanup }) => {
    const url = 'https://claude.com/cai/oauth/authorize?code=true&client_id=x&state=y'
    cleanup(
      await stubBinary(
        `printf 'Visit ${url.slice(0, 50)}'; sleep 0.3; printf '${url.slice(50)}\\n'; sleep 5`,
      ),
    )
    const dir = await mkdtemp(join(tmpdir(), 'claude-home-'))
    cleanup(() => rm(dir, { recursive: true, force: true }))
    const login = new ClaudeCodeCli().login(dir)
    cleanup(() => login.kill())
    assert.equal(await login.url, url)
  })
})
