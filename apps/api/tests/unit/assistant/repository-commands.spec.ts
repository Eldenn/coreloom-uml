import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { test } from '@japa/runner'
import { REPOSITORY_SANDBOX, REPOSITORY_TOOL_LIMITS } from '#app/assistant/constants/repository'
import {
  CLONE,
  GIT_BLAME,
  GIT_LOG,
  GIT_SHOW,
  LIST,
  READ,
  SEARCH,
} from '#app/assistant/services/repository-commands'

/**
 * The fixed command lines of a repository sandbox, run here with this machine's bash and git on
 * a temporary folder: what they answer is what the API reads back from a sandbox. The clone
 * reads a local repository, which the sandbox's git refuses (https only): the test allows the
 * `file` protocol the same way a token is passed, through `GIT_CONFIG_*`.
 */

let root = ''
let base = ''
let firstCommit = ''

const allowFile = {
  GIT_CONFIG_COUNT: '1',
  GIT_CONFIG_KEY_0: 'protocol.file.allow',
  GIT_CONFIG_VALUE_0: 'always',
}

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

async function git(cwd: string, ...args: string[]) {
  const { stdout } = await promisify(execFile)('git', args, {
    cwd,
    env: {
      PATH: process.env.PATH ?? '',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_AUTHOR_NAME: 'Ada',
      GIT_AUTHOR_EMAIL: 'ada@example.com',
      GIT_COMMITTER_NAME: 'Ada',
      GIT_COMMITTER_EMAIL: 'ada@example.com',
    },
  })
  return stdout.trim()
}

test.group('repository sandbox command lines', (group) => {
  group.setup(async () => {
    base = await mkdtemp(join(tmpdir(), 'repository-commands-'))
    const source = join(base, 'source')
    await mkdir(join(source, 'src', 'deep', 'deeper'), { recursive: true })
    await git(base, 'init', '--quiet', '--initial-branch=main', source)
    await writeFile(join(source, 'README.md'), 'Shop\n')
    await writeFile(join(source, 'src', 'orders.ts'), 'line 1 placeOrder\n')
    await git(source, 'add', '.')
    await git(source, 'commit', '--quiet', '-m', 'First orders')
    firstCommit = await git(source, 'rev-parse', 'HEAD')
    await writeFile(
      join(source, 'src', 'orders.ts'),
      `${Array.from({ length: 30 }, (_, n) => `line ${String(n + 1)} placeOrder`).join('\n')}\n`,
    )
    await writeFile(join(source, 'src', 'deep', 'deeper', 'far.ts'), 'far\n')
    await writeFile(join(source, 'src', 'logo.bin'), Buffer.from([0, 1, 2, 0, 3]))
    await symlink('/etc/passwd', join(source, 'src', 'passwd'))
    await git(source, 'add', '.')
    await git(source, 'commit', '--quiet', '-m', 'More orders')
    root = join(base, 'repo')
    const cloned = await sh(CLONE, {
      REPO_URL: `file://${source}`,
      REPO_BRANCH: '',
      ...allowFile,
    })
    if (cloned.exitCode !== 0) throw new Error(`CLONE failed (${String(cloned.exitCode)})`)
    if (!/^[0-9a-f]{40}$/.test(cloned.stdout.trim())) throw new Error('CLONE gave no commit')
    return () => rm(base, { recursive: true, force: true })
  })

  test('CLONE writes no credential and checks out symbolic links as files', async ({ assert }) => {
    const config = await readFile(`${root}.git/config`, 'utf8')
    assert.notInclude(config, 'extraheader')
    assert.notInclude(config, 'protocol.file')
    const link = await sh(READ, { READ_PATH: 'src/passwd', READ_FROM: '1', READ_TO: '2' })
    assert.equal(link.stdout.trim(), '0\n/etc/passwd')
  })

  test('CLONE refuses an unknown branch and a repository it cannot reach', async ({ assert }) => {
    const saved = root
    root = join(base, 'other')
    const branch = await sh(CLONE, {
      REPO_URL: `file://${join(base, 'source')}`,
      REPO_BRANCH: 'nope',
      ...allowFile,
    })
    assert.equal(branch.exitCode, 1)
    // Without the test's allowance, the sandbox's git takes https only.
    const local = await sh(CLONE, { REPO_URL: `file://${join(base, 'source')}`, REPO_BRANCH: '' })
    assert.equal(local.exitCode, 1)
    root = saved
  })

  test('LIST answers two levels, folders with a slash, never .git', async ({ assert }) => {
    const top = (await sh(LIST, { LIST_PATH: '' })).stdout.split('\n')
    assert.includeMembers(top, ['README.md', 'src/', 'src/orders.ts', 'src/deep/'])
    assert.notInclude(top, 'src/deep/deeper/')
    assert.notInclude(top, '.git')
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

  test('no command reads out of the repository or into .git, by `..` or a symbolic link', async ({
    assert,
  }) => {
    await writeFile(join(root, '..', 'outside.txt'), 'outside\n')
    await symlink(join(root, '..'), join(root, 'up'))
    for (const path of ['../outside.txt', 'src/../../outside.txt', 'up/outside.txt', '.git']) {
      const read = await sh(READ, { READ_PATH: path, READ_FROM: '1', READ_TO: '2' })
      assert.equal(read.exitCode, 3, path)
      assert.equal(read.stdout, '', path)
    }
    assert.equal((await sh(LIST, { LIST_PATH: '..' })).exitCode, 3)
    assert.equal((await sh(LIST, { LIST_PATH: 'up' })).exitCode, 3)
    assert.equal((await sh(SEARCH, { SEARCH_PATH: 'up', SEARCH_QUERY: 'outside' })).exitCode, 3)
    assert.equal((await sh(GIT_LOG, { LOG_PATH: '../' })).exitCode, 3)
    assert.equal(
      (await sh(GIT_BLAME, { BLAME_PATH: 'up/outside.txt', BLAME_FROM: '1', BLAME_TO: '1' }))
        .exitCode,
      3,
    )
    await rm(join(root, 'up'))
  })

  test('the variables are data: a path, a query or a commit never reaches the shell', async ({
    assert,
  }) => {
    const marker = join(root, '..', 'pwned')
    const read = await sh(READ, {
      READ_PATH: `$(touch ${marker})`,
      READ_FROM: '1',
      READ_TO: '2',
    })
    const search = await sh(SEARCH, { SEARCH_PATH: '', SEARCH_QUERY: `"; touch ${marker}; "` })
    const show = await sh(GIT_SHOW, { SHOW_COMMIT: `$(touch ${marker})`, SHOW_PATH: '' })
    assert.notEqual(read.exitCode, 0)
    assert.equal(search.exitCode, 0)
    assert.notEqual(show.exitCode, 0)
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

  test('GIT_LOG, GIT_SHOW and GIT_BLAME read the history', async ({ assert }) => {
    const log = (await sh(GIT_LOG, { LOG_PATH: 'src/orders.ts' })).stdout.trim().split('\n')
    assert.lengthOf(log, 2)
    assert.match(log[0], /^[0-9a-f]{7,} \d{4}-\d{2}-\d{2} Ada: More orders$/)
    assert.match(log[1], /First orders$/)

    const show = await sh(GIT_SHOW, { SHOW_COMMIT: firstCommit.slice(0, 10), SHOW_PATH: '' })
    assert.equal(show.exitCode, 0)
    assert.include(show.stdout, `commit ${firstCommit}`)
    assert.include(show.stdout, 'First orders')
    assert.include(show.stdout, '+line 1 placeOrder')
    const unknown = await sh(GIT_SHOW, { SHOW_COMMIT: 'abcdef1234', SHOW_PATH: '' })
    assert.notEqual(unknown.exitCode, 0)

    const blame = await sh(GIT_BLAME, {
      BLAME_PATH: 'src/orders.ts',
      BLAME_FROM: '1',
      BLAME_TO: '2',
    })
    assert.equal(blame.exitCode, 0)
    const blamed = blame.stdout.trim().split('\n')
    assert.lengthOf(blamed, 2)
    assert.include(blamed[0], firstCommit.slice(0, 7))
    assert.include(blamed[0], 'Ada')
    const past = await sh(GIT_BLAME, {
      BLAME_PATH: 'src/orders.ts',
      BLAME_FROM: '99',
      BLAME_TO: '100',
    })
    assert.notEqual(past.exitCode, 0)
  })
})
