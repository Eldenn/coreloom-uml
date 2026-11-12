import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { HASH_MARKERS, wrapManagedBlock } from '@coreloom-uml/catalog'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { ExitCode } from '../src/errors.ts'
import { pull } from '../src/pull.ts'
import { status } from '../src/status.ts'
import {
  API_KEY,
  FixtureApi,
  file,
  generation,
  recordingIo,
  settingsFile,
  tempDir,
} from './fixtures.ts'

let api: FixtureApi
let dir: Awaited<ReturnType<typeof tempDir>>

beforeEach(async () => {
  api = new FixtureApi()
  await api.start()
  dir = await tempDir()
})

afterEach(async () => {
  await api.stop()
  await dir.cleanup()
})

it('reports each file and whether a newer generation exists', async () => {
  const env = { CORELOOM_UML_API_KEY: API_KEY, XDG_CONFIG_HOME: dir.path }
  api.current = generation(1, [
    file('AGENTS.md', 'a'),
    file('B.md', 'b'),
    file('C.md', 'c'),
    file('D.md', 'd'),
    settingsFile('e.json', '{"deny":["x"]}'),
    settingsFile('f.json', '{"deny":["x"]}'),
    settingsFile('.githooks/pre-commit', wrapManagedBlock('exit 0', HASH_MARKERS)),
    settingsFile('.github/workflows/g.yml', wrapManagedBlock('name: G', HASH_MARKERS)),
  ])
  await pull({ cwd: dir.path, io: recordingIo().io, env, apiUrl: api.url, config: '3', yes: true })
  await writeFile(join(dir.path, 'e.json'), '{"deny":["x","mine"],"other":1}')
  await writeFile(join(dir.path, 'f.json'), '{"deny":[]}')
  const b = await readFile(join(dir.path, 'B.md'), 'utf8')
  await writeFile(join(dir.path, 'B.md'), b.replace('\nb\n', '\nedited\n'))
  await writeFile(join(dir.path, 'C.md'), '# No block\n')
  await rm(join(dir.path, 'D.md'))
  api.current = generation(2, [file('AGENTS.md', 'a2')])

  const recorder = recordingIo()
  expect(await status({ cwd: dir.path, io: recorder.io, env })).toBe(ExitCode.Ok)
  const output = recorder.output()
  expect(output).toMatch(/unchanged\s+AGENTS\.md/)
  expect(output).toMatch(/block edited\s+B\.md/)
  expect(output).toMatch(/block missing\s+C\.md/)
  expect(output).toMatch(/file missing\s+D\.md/)
  expect(output).toMatch(/unchanged\s+e\.json/)
  expect(output).toMatch(/keys edited\s+f\.json/)
  // A hook (after its #! line) and a workflow hold their block in `#` markers.
  expect(output).toMatch(/unchanged\s+\.githooks\/pre-commit/)
  expect(output).toMatch(/unchanged\s+\.github\/workflows\/g\.yml/)
  expect(output).toContain('A newer generation exists (#2')
})

it('works without a key, and without a manifest says to pull first', async () => {
  const env = { XDG_CONFIG_HOME: dir.path }
  await expect(status({ cwd: dir.path, io: recordingIo().io, env })).rejects.toThrow(
    /pull --config/,
  )

  api.current = generation(1, [file('AGENTS.md', 'a')])
  await pull({
    cwd: dir.path,
    io: recordingIo().io,
    env: { ...env, CORELOOM_UML_API_KEY: API_KEY },
    apiUrl: api.url,
    config: '3',
  })
  const recorder = recordingIo()
  expect(await status({ cwd: dir.path, io: recorder.io, env })).toBe(ExitCode.Ok)
  expect(recorder.output()).toContain('No API key')
})

it('check: exits with a code of its own for up to date, stale, missing and edited', async () => {
  const env = { CORELOOM_UML_API_KEY: API_KEY, XDG_CONFIG_HOME: dir.path }
  const check = (json = false) => {
    const recorder = recordingIo()
    return status({ cwd: dir.path, io: recorder.io, env, check: true, json }).then((code) => ({
      code,
      output: recorder.output(),
    }))
  }
  api.current = generation(1, [file('AGENTS.md', 'a'), file('B.md', 'b')])
  await pull({ cwd: dir.path, io: recordingIo().io, env, apiUrl: api.url, config: '3' })
  expect((await check()).code).toBe(ExitCode.Ok)

  api.current = generation(2, [file('AGENTS.md', 'a2')])
  expect((await check()).code).toBe(ExitCode.Stale)

  await rm(join(dir.path, 'B.md'))
  expect((await check()).code).toBe(ExitCode.BlockMissing)

  const agents = await readFile(join(dir.path, 'AGENTS.md'), 'utf8')
  await writeFile(join(dir.path, 'AGENTS.md'), agents.replace('\na\n', '\nedited\n'))
  const result = await check(true)
  expect(result.code).toBe(ExitCode.EditedBlockKept)
  expect(JSON.parse(result.output)).toEqual({
    ok: false,
    exitCode: 2,
    generationId: 1,
    latestGenerationId: 2,
    files: [
      { path: 'AGENTS.md', state: 'block edited' },
      { path: 'B.md', state: 'file missing' },
    ],
  })
})

it('check: fails without a key or when the API cannot answer', async () => {
  const env = { CORELOOM_UML_API_KEY: API_KEY, XDG_CONFIG_HOME: dir.path }
  api.current = generation(1, [file('AGENTS.md', 'a')])
  await pull({ cwd: dir.path, io: recordingIo().io, env, apiUrl: api.url, config: '3' })

  await expect(
    status({
      cwd: dir.path,
      io: recordingIo().io,
      env: { XDG_CONFIG_HOME: dir.path },
      check: true,
    }),
  ).rejects.toThrow(/No API key/)
  api.status = 401
  await expect(status({ cwd: dir.path, io: recordingIo().io, env, check: true })).rejects.toThrow(
    /refused/,
  )
})
