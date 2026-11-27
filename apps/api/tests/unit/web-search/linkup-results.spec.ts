import { readFile } from 'node:fs/promises'
import { test } from '@japa/runner'
import { WEB_SEARCH_LIMITS } from '#app/web-search/constants/web-search'
import { readLinkupResults } from '#app/web-search/services/web-search'

const FIXTURE = new URL('../../fixtures/linkup-search.json', import.meta.url)

test.group('readLinkupResults', () => {
  test('keeps the text results with a web address, cut to the limits', async ({ assert }) => {
    const body: unknown = JSON.parse(await readFile(FIXTURE, 'utf8'))
    const results = readLinkupResults(body)

    if (!results) return assert.fail('the fixture is read')
    assert.deepEqual(
      results.map((result) => result.url),
      ['https://www.conventionalcommits.org/en/v1.0.0/', 'http://example.com/long'],
    )
    assert.deepEqual(results[0], {
      title: 'Conventional Commits 1.0.0',
      url: 'https://www.conventionalcommits.org/en/v1.0.0/',
      snippet: 'A specification for adding human and machine readable meaning to commit messages.',
      publishedAt: '2024-03-01',
    })
    assert.lengthOf(results[1].title, WEB_SEARCH_LIMITS.titleMaxLength)
    assert.lengthOf(results[1].snippet, WEB_SEARCH_LIMITS.snippetMaxLength)
    assert.isNull(results[1].publishedAt)
  })

  test('answers null for a body of another shape', ({ assert }) => {
    assert.isNull(readLinkupResults({}))
    assert.isNull(readLinkupResults({ results: 'x' }))
  })
})
