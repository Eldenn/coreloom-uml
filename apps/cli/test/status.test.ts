import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { ExitCode } from '../src/errors.ts'
import { pull } from '../src/pull.ts'
import { status } from '../src/status.ts'
import { API_KEY, FixtureApi, file, generation, recordingIo, tempDir } from './fixtures.ts'

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
  ])
  await pull({ cwd: dir.path, io: recordingIo().io, env, apiUrl: api.url, project: '7' })
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
  expect(output).toContain('A newer generation exists (#2')
})

it('works without a key, and without a manifest says to pull first', async () => {
  const env = { XDG_CONFIG_HOME: dir.path }
  await expect(status({ cwd: dir.path, io: recordingIo().io, env })).rejects.toThrow(
    /pull --project/,
  )

  api.current = generation(1, [file('AGENTS.md', 'a')])
  await pull({
    cwd: dir.path,
    io: recordingIo().io,
    env: { ...env, CORELOOM_UML_API_KEY: API_KEY },
    apiUrl: api.url,
    project: '7',
  })
  const recorder = recordingIo()
  expect(await status({ cwd: dir.path, io: recorder.io, env })).toBe(ExitCode.Ok)
  expect(recorder.output()).toContain('No API key')
})
