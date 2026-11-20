import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { test } from '@japa/runner'
import { REPOSITORY_SANDBOX, REPOSITORY_TOOL_LIMITS } from '#app/assistant/constants/repository'
import { LIST, READ, SEARCH, UNPACK } from '#app/assistant/services/repository-commands'

/**
 * The fixed command lines of a repository sandbox, run here with this machine's bash on a
 * temporary folder: what they answer is what the API reads back from a sandbox.
 */

let root = ''

function sh(line: string, env: Record<string, string>) {
  return new Promise<{ exitCode: number; stdout: string }>((resolve) => {
    execFile(
      '/bin/bash',
      ['-c', line],
      { env: { PATH: process.env.PATH ?? '', REPO_ROOT: root, ...env }, maxBuffer: 1 << 26 },
      (error, stdout) => {
        const code = error ? (typeof error.code === 'number' ? error.code : 1) : 0
        resolve({ exitCode: code, stdout })
      },
    )
  })
}

test.group('repository sandbox command lines', (group) => {
  group.setup(async () => {
    const base = await mkdtemp(join(tmpdir(), 'repository-commands-'))
    const source = join(base, 'source')
    await mkdir(join(source, 'src', 'deep', 'deeper'), { recursive: true })
    await writeFile(join(source, 'README.md'), 'Shop\n')
    await writeFile(
      join(source, 'src', 'orders.ts'),
      `${Array.from({ length: 30 }, (_, n) => `line ${String(n + 1)} placeOrder`).join('\n')}\n`,
    )
    await writeFile(join(source, 'src', 'deep', 'deeper', 'far.ts'), 'far\n')
    await writeFile(join(source, 'src', 'logo.bin'), Buffer.from([0, 1, 2, 0, 3]))
    const archive = join(base, 'repo.tar.gz')
    await promisify(execFile)('tar', ['-czf', archive, '-C', source, '.'])
    root = join(base, 'repo')
    const unpacked = await sh(UNPACK, { ARCHIVE_PATH: archive })
    if (unpacked.exitCode !== 0) throw new Error('UNPACK failed')
    return () => rm(base, { recursive: true, force: true })
  })

  test('UNPACK unpacks the archive and deletes it', async ({ assert }) => {
    const listed = await sh(LIST, { LIST_PATH: '' })
    assert.include(listed.stdout.split('\n'), 'README.md')
    const again = await sh('test -e "$ARCHIVE_PATH"', {
      ARCHIVE_PATH: join(root, '..', 'repo.tar.gz'),
    })
    assert.notEqual(again.exitCode, 0)
  })

  test('LIST answers two levels, folders with a slash, and fails outside a folder', async ({
    assert,
  }) => {
    const top = (await sh(LIST, { LIST_PATH: '' })).stdout.split('\n')
    assert.includeMembers(top, ['README.md', 'src/', 'src/orders.ts', 'src/deep/'])
    assert.notInclude(top, 'src/deep/deeper/')
    const nested = (await sh(LIST, { LIST_PATH: 'src/deep' })).stdout.split('\n')
    assert.includeMembers(nested, ['deeper/', 'deeper/far.ts'])
    assert.notEqual((await sh(LIST, { LIST_PATH: 'nope' })).exitCode, 0)
  })

  test('READ answers the line count then the lines asked, and refuses a binary file', async ({
    assert,
  }) => {
    const read = await sh(READ, { READ_PATH: 'src/orders.ts', READ_FROM: '3', READ_TO: '4' })
    assert.equal(read.exitCode, 0)
    assert.deepEqual(read.stdout.trim().split('\n'), [
      '30',
      'line 3 placeOrder',
      'line 4 placeOrder',
    ])
    const binary = await sh(READ, { READ_PATH: 'src/logo.bin', READ_FROM: '1', READ_TO: '5' })
    assert.notEqual(binary.exitCode, 0)
    const missing = await sh(READ, { READ_PATH: 'nope.ts', READ_FROM: '1', READ_TO: '5' })
    assert.notEqual(missing.exitCode, 0)
  })

  test('no command reads out of the repository, by `..` or by a symbolic link', async ({
    assert,
  }) => {
    await writeFile(join(root, '..', 'outside.txt'), 'outside\n')
    await symlink(join(root, '..'), join(root, 'up'))
    for (const path of ['../outside.txt', 'src/../../outside.txt', 'up/outside.txt']) {
      const read = await sh(READ, { READ_PATH: path, READ_FROM: '1', READ_TO: '2' })
      assert.equal(read.exitCode, 3, path)
      assert.equal(read.stdout, '', path)
    }
    assert.equal((await sh(LIST, { LIST_PATH: '..' })).exitCode, 3)
    assert.equal((await sh(LIST, { LIST_PATH: 'up' })).exitCode, 3)
    assert.equal((await sh(SEARCH, { SEARCH_PATH: 'up', SEARCH_QUERY: 'outside' })).exitCode, 3)
    await rm(join(root, 'up'))
  })

  test('the variables are data: a path or a query never reaches the shell', async ({ assert }) => {
    const marker = join(root, '..', 'pwned')
    const read = await sh(READ, {
      READ_PATH: `$(touch ${marker})`,
      READ_FROM: '1',
      READ_TO: '2',
    })
    const search = await sh(SEARCH, { SEARCH_PATH: '', SEARCH_QUERY: `"; touch ${marker}; "` })
    assert.notEqual(read.exitCode, 0)
    assert.equal(search.exitCode, 0)
    assert.notEqual((await sh('test -e "$M"', { M: marker })).exitCode, 0)
  })

  test('SEARCH answers path:line:text, any case, a few per file, and succeeds on nothing', async ({
    assert,
  }) => {
    const found = (await sh(SEARCH, { SEARCH_PATH: '', SEARCH_QUERY: 'PLACEORDER' })).stdout
      .trim()
      .split('\n')
    assert.lengthOf(found, REPOSITORY_TOOL_LIMITS.searchPerFile)
    assert.equal(found[0], 'src/orders.ts:1:line 1 placeOrder')
    const none = await sh(SEARCH, { SEARCH_PATH: 'src', SEARCH_QUERY: 'kubernetes' })
    assert.equal(none.exitCode, 0)
    assert.equal(none.stdout, '')
    assert.isAtMost(REPOSITORY_SANDBOX.outputMaxBytes, 20_000)
  })
})
