import { test } from '@japa/runner'
import {
  SECRET_PATTERNS,
  SecretFilter,
  secretForms,
} from '#app/convention-evals/services/output-filter'

/** A fixture key, built so no file holds it whole. */
const KEY = ['sk-ant-api03', 'fixture', 'Q'.repeat(32)].join('-')

test.group('Convention tests - the output filter', () => {
  test('finds the exact value and its encoded forms, at any offset', ({ assert }) => {
    const filter = new SecretFilter([KEY])
    assert.isTrue(filter.leaks(`key: ${KEY}`))
    assert.isTrue(filter.leaks(`url=${encodeURIComponent(KEY)}&x=1`))
    assert.isTrue(filter.leaks(Buffer.from(`hex ${KEY}`).toString('hex')))
    assert.isTrue(filter.leaks(Buffer.from(KEY).toString('hex').toUpperCase()))
    for (const prefix of ['', 'a', 'ab', 'abc', 'token=', 'x-api-key: ']) {
      for (const encoding of ['base64', 'base64url'] as const) {
        const encoded = Buffer.from(`${prefix}${KEY};`).toString(encoding)
        assert.isTrue(
          filter.leaks(`dump ${encoded} end`),
          `${encoding} after ${JSON.stringify(prefix)}`,
        )
      }
    }
  })

  test('finds the shapes of other secrets with no credential given', ({ assert }) => {
    const filter = new SecretFilter([])
    const shapes = [
      ['sk-ant-api03', 'Z'.repeat(40)].join('-'),
      ['sk-proj', 'a1'.repeat(20)].join('-'),
      ['e2b', 'b2'.repeat(15)].join('_'),
      ['ghp', 'c3'.repeat(18)].join('_'),
      ['github_pat', 'd4'.repeat(25)].join('_'),
    ]
    for (const shape of shapes) assert.isTrue(filter.leaks(`found ${shape}`), shape)
    assert.isFalse(filter.leaks('fix: the sum starts at the first value'))
    assert.isFalse(filter.leaks('pnpm add slugify && git commit -m "feat: slug"'))
    assert.isAbove(SECRET_PATTERNS.length, 4)
  })

  test('does not look for a credential too short to tell from chance', ({ assert }) => {
    assert.deepEqual(secretForms('short'), [])
  })
})
