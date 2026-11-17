import { test } from '@japa/runner'
import { GITHUB_SOURCE_LIMITS, GITHUB_URLS, GithubFailure } from '#app/github/constants/github'
import GithubApi, { isCommitId, isRepositoryPath } from '#app/github/services/github-api'

type Call = { url: string; init: RequestInit }

const REPOSITORY = { owner: 'acme', name: 'shop' }
const COMMIT = 'abc1234'

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

/** A body sent in small chunks, without a content-length header. */
function streamed(bytes: Uint8Array): Response {
  const chunk = 64_000
  let offset = 0
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= bytes.length) return controller.close()
        controller.enqueue(bytes.subarray(offset, offset + chunk))
        offset += chunk
      },
    }),
  )
}

test.group('GitHub - read one file at a commit', (group) => {
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

  test('reads a file anonymously from the raw host, each path segment encoded', async ({
    assert,
  }) => {
    const calls = stubFetch(() => new Response('export const x = 1\n'))
    const result = await new GithubApi().readFile(REPOSITORY, COMMIT, 'a b/é#.ts')

    assert.deepEqual(result, { ok: true, value: 'export const x = 1\n' })
    assert.lengthOf(calls, 1)
    assert.equal(calls[0].url, `${GITHUB_URLS.raw}/acme/shop/abc1234/a%20b/%C3%A9%23.ts`)
    assert.notProperty(headersOf(calls[0]), 'authorization')
    assert.equal(calls[0].init.redirect, 'error')
    assert.instanceOf(calls[0].init.signal, AbortSignal)
  })

  test('reads a file with a token from the contents API', async ({ assert }) => {
    const calls = stubFetch(() => new Response('class Shop {}'))
    const result = await new GithubApi().readFile(REPOSITORY, COMMIT, 'a b/é#.ts', 'T')

    assert.deepEqual(result, { ok: true, value: 'class Shop {}' })
    assert.lengthOf(calls, 1)
    assert.equal(
      calls[0].url,
      `${GITHUB_URLS.api}/repos/acme/shop/contents/a%20b/%C3%A9%23.ts?ref=abc1234`,
    )
    assert.equal(headersOf(calls[0]).authorization, 'Bearer T')
    assert.equal(headersOf(calls[0]).accept, 'application/vnd.github.raw+json')
    assert.equal(calls[0].init.redirect, 'error')
  })

  test('answers null for a 404, a refused path or commit (no fetch), a file over the limit, a file that is not UTF-8 text', async ({
    assert,
  }) => {
    const github = new GithubApi()
    const over = new Uint8Array(GITHUB_SOURCE_LIMITS.fileBytes + 1).fill(0x61)
    const answers: Record<string, () => Response> = {
      missing: () => new Response('Not Found', { status: 404 }),
      'over-declared': () =>
        new Response(over, { headers: { 'content-length': String(over.length) } }),
      'over-streamed': () => streamed(over),
      binary: () => new Response(new Uint8Array([0xff, 0xfe, 0x00])),
      nul: () => new Response('abc\u0000def'),
    }
    const calls = stubFetch((url) => answers[url.split('/').at(-1) ?? '']())

    for (const name of Object.keys(answers)) {
      assert.deepEqual(
        await github.readFile(REPOSITORY, COMMIT, name),
        { ok: true, value: null },
        name,
      )
    }
    assert.lengthOf(calls, Object.keys(answers).length)

    assert.deepEqual(await github.readFile(REPOSITORY, COMMIT, '../x'), { ok: true, value: null })
    assert.deepEqual(await github.readFile(REPOSITORY, 'main', 'a.ts'), { ok: true, value: null })
    assert.deepEqual(await github.readFile({ owner: 'ac/me', name: 'shop' }, COMMIT, 'a.ts'), {
      ok: true,
      value: null,
    })
    assert.lengthOf(calls, Object.keys(answers).length)
  })

  test('answers denied for 401 and 403, unreachable for 429, 5xx and a network error', async ({
    assert,
  }) => {
    const github = new GithubApi()
    const cases = [
      [401, GithubFailure.Denied],
      [403, GithubFailure.Denied],
      [429, GithubFailure.Unreachable],
      [500, GithubFailure.Unreachable],
      [503, GithubFailure.Unreachable],
    ] as const
    for (const [status, failure] of cases) {
      stubFetch(() => new Response('no', { status }))
      assert.deepEqual(
        await github.readFile(REPOSITORY, COMMIT, 'a.ts', 'T'),
        { ok: false, failure },
        String(status),
      )
      restore()
    }

    stubFetch(() => {
      throw new TypeError('fetch failed')
    })
    assert.deepEqual(await github.readFile(REPOSITORY, COMMIT, 'a.ts'), {
      ok: false,
      failure: GithubFailure.Unreachable,
    })
  })
})
