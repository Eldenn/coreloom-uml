import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from '@japa/runner'
import HarborRunner from '#app/convention-evals/services/harbor-runner'

/** What the server holds and Harbor must never inherit: set for the test, put back after. */
const SERVER_SECRETS = ['APP_KEY', 'LLM_KEYS_ENCRYPTION_KEYS', 'DB_PASSWORD'] as const

/**
 * A stand-in `harbor`: a Node script (Node adds no variable of its own) that writes the sorted
 * NAMES of its environment to the file named by its last argument, never a value.
 */
function fakeHarbor(dir: string) {
  const file = join(dir, 'harbor')
  writeFileSync(
    file,
    [
      `#!${process.execPath}`,
      "const { writeFileSync } = require('node:fs')",
      'writeFileSync(process.argv.at(-1), JSON.stringify(Object.keys(process.env).sort()))',
      '',
    ].join('\n'),
  )
  chmodSync(file, 0o700)
  return file
}

test.group('Convention tests - the Harbor runner', () => {
  test('the child gets exactly the environment it is given, nothing of the server', async ({
    assert,
  }) => {
    const dir = mkdtempSync(join(realpathSync(tmpdir()), 'coreloom-uml-harbor-runner-'))
    const before = Object.fromEntries(SERVER_SECRETS.map((name) => [name, process.env[name]]))
    try {
      for (const name of SERVER_SECRETS) {
        process.env[name] = `server-${name.toLowerCase()}-${Math.random().toString(36).slice(2)}`
      }
      const names = join(dir, 'names.json')
      const env = {
        PATH: '/usr/bin:/bin',
        E2B_API_KEY: ['e2b', 'fixture', 'R'.repeat(24)].join('-'),
        ANTHROPIC_API_KEY: ['sk-ant-api03', 'fixture', 'Q'.repeat(32)].join('-'),
      }

      const started = new HarborRunner().start({
        file: fakeHarbor(dir),
        args: ['run', '-e', 'e2b', names],
        env,
      })

      assert.equal(await started.exited, 0)
      const seen = JSON.parse(readFileSync(names, 'utf8')) as string[]
      assert.deepEqual(seen, Object.keys(env).sort())
      for (const name of SERVER_SECRETS) assert.notInclude(seen, name)
      // Nothing else of the server's own environment either.
      const inherited = Object.keys(process.env).filter((name) => !(name in env))
      assert.isAbove(inherited.length, 0)
      for (const name of inherited) assert.notInclude(seen, name)
    } finally {
      for (const name of SERVER_SECRETS) {
        if (before[name] === undefined) delete process.env[name]
        else process.env[name] = before[name]
      }
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
