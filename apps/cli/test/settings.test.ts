import { readFile, stat } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setKey } from '../src/set-key.ts'
import { normalizeApiUrl, resolveApiKey, resolveApiUrl, userConfigPath } from '../src/settings.ts'
import { recordingIo, tempDir } from './fixtures.ts'

let dir: Awaited<ReturnType<typeof tempDir>>

beforeEach(async () => {
  dir = await tempDir()
})

afterEach(async () => {
  await dir.cleanup()
})

describe('config set-key', () => {
  it('stores the key read on standard input, readable by its owner only', async () => {
    const env = { XDG_CONFIG_HOME: dir.path }
    await setKey({ io: recordingIo({ stdin: 'clu_abc\n' }).io, env })

    const path = userConfigPath(env)
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ apiKey: 'clu_abc' })
    expect((await stat(path)).mode & 0o777).toBe(0o600)
    expect(await resolveApiKey(env)).toBe('clu_abc')
    expect(await resolveApiKey({ ...env, CORELOOM_UML_API_KEY: 'clu_env' })).toBe('clu_env')
  })

  it('refuses something that is not an API key', async () => {
    const env = { XDG_CONFIG_HOME: dir.path }
    await expect(setKey({ io: recordingIo({ stdin: 'sk-123' }).io, env })).rejects.toThrow(/clu_/)
    await expect(setKey({ io: recordingIo({ stdin: '' }).io, env })).rejects.toThrow(/No key/)
  })
})

describe('API URL', () => {
  it('takes the flag, then the environment, then the manifest', () => {
    const env = { CORELOOM_UML_API_URL: 'https://env.test' }
    expect(resolveApiUrl('https://flag.test/', 'https://manifest.test', env)).toBe(
      'https://flag.test',
    )
    expect(resolveApiUrl(undefined, 'https://manifest.test', env)).toBe('https://env.test')
    expect(resolveApiUrl(undefined, 'https://manifest.test/api/', {})).toBe(
      'https://manifest.test/api',
    )
  })

  it('refuses other schemes and credentials', () => {
    expect(() => normalizeApiUrl('ftp://x.test')).toThrow(/http/)
    expect(() => normalizeApiUrl('https://u:p@x.test')).toThrow(/credentials/)
    expect(() => normalizeApiUrl('nope')).toThrow(/Invalid/)
  })
})
