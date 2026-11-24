import { test } from '@japa/runner'
import { GITHUB_SOURCE_LIMITS, GITHUB_URLS, GithubFailure } from '#app/github/constants/github'
import GithubApi, { isCommitId, isRepositoryPath } from '#app/github/services/github-api'

type Call = { url: string; init: RequestInit }

const REPOSITORY = { owner: 'acme', name: 'shop' }

/** Replaces `fetch` for one test: every call is recorded and answered by `answer`. */
function stubFetch(answer: (url: string) => Response | Promise<Response>): Call[] {
  const calls: Call[] = []
  const original = globalThis.fetch
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init: init ?? {} })
    return answer(url)
  }) as typeof fetch
  restore = () => {
    globalThis.fetch = original
  }
  return calls
}
let restore = () => {}

function headersOf(call: Call): Record<string, string> {
  return call.init.headers as Record<string, string>
}

test.group('GitHub - paths, commits and who reads a repository', (group) => {
  group.each.teardown(() => {
    restore()
    restore = () => {}
  })

  test('isRepositoryPath accepts a plain relative path and refuses the rest', ({ assert }) => {
    for (const path of ['apps/api/app/x.ts', 'a b/é.ts', 'a%20b.ts']) {
      assert.isTrue(isRepositoryPath(path), path)
    }
    for (const path of [
      '',
      '/etc/passwd',
      '../x',
      'a/../b',
      'a//b',
      './a',
      'a/.',
      'a/',
      'a\\b',
      'a\u0000b',
      'a\nb',
      'a\ud800.ts',
      'x'.repeat(GITHUB_SOURCE_LIMITS.pathLength + 1),
    ]) {
      assert.isFalse(isRepositoryPath(path), JSON.stringify(path))
    }
  })

  test('isCommitId accepts 7 to 64 hexadecimal characters', ({ assert }) => {
    for (const commit of ['abc1234', 'ABCDEF0', 'a'.repeat(40), 'f'.repeat(64)]) {
      assert.isTrue(isCommitId(commit), commit)
    }
    for (const commit of ['', 'abc123', 'a'.repeat(65), 'abc123g', 'main', '../abc1234']) {
      assert.isFalse(isCommitId(commit), commit)
    }
  })

  test('canRead asks GitHub for the permission of one login on the repository', async ({
    assert,
  }) => {
    const github = new GithubApi()
    let answer = () => Response.json({ permission: 'read' })
    const calls = stubFetch(() => answer())
    assert.deepEqual(await github.canRead(REPOSITORY, 'octo', 'T'), { ok: true, value: true })
    assert.equal(calls[0]?.url, `${GITHUB_URLS.api}/repos/acme/shop/collaborators/octo/permission`)
    assert.equal(headersOf(calls[0] as Call).authorization, 'Bearer T')

    answer = () => Response.json({ permission: 'none' })
    assert.deepEqual(await github.canRead(REPOSITORY, 'octo', 'T'), { ok: true, value: false })
    answer = () => new Response('Not Found', { status: 404 })
    assert.deepEqual(await github.canRead(REPOSITORY, 'octo', 'T'), { ok: true, value: false })
    answer = () => new Response('later', { status: 503 })
    assert.deepEqual(await github.canRead(REPOSITORY, 'octo', 'T'), {
      ok: false,
      failure: GithubFailure.Unreachable,
    })
    // A login that is no GitHub login is never sent.
    const before = calls.length
    assert.deepEqual(await github.canRead(REPOSITORY, 'oc/to', 'T'), { ok: true, value: false })
    assert.lengthOf(calls, before)
  })
})
