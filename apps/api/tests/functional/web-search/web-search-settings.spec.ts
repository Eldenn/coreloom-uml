import db from '@adonisjs/lucid/services/db'
import { test } from '@japa/runner'
import { WebSearchKind } from '#app/web-search/constants/web-search'
import {
  deleteWebSearch,
  savedWebSearch,
  saveWebSearch,
  webSearchKey,
  webSearchReady,
} from '#app/web-search/services/web-search-settings'
import { keepWebSearchSetting } from '#tests/helpers/web-search-setting'

const KEY = 'lk-test-abcd'
const TABLE = 'web_search_settings'

test.group('Web search - the instance setting', (group) => {
  group.setup(() => keepWebSearchSetting())
  group.each.setup(() => deleteWebSearch())

  test('saves the key sealed and answers its hint, the key and readiness', async ({ assert }) => {
    const saved = await saveWebSearch(WebSearchKind.Linkup, KEY)
    assert.equal(saved.kind, WebSearchKind.Linkup)
    assert.equal(saved.keyHint, 'abcd')

    const summary = await savedWebSearch()
    assert.equal(summary?.kind, WebSearchKind.Linkup)
    assert.equal(summary?.keyHint, 'abcd')
    assert.deepEqual(await webSearchKey(), { kind: WebSearchKind.Linkup, apiKey: KEY })
    assert.isTrue(await webSearchReady())

    const rows = await db.from(TABLE)
    assert.lengthOf(rows, 1)
    assert.notInclude(rows[0].sealed_key, KEY)
  })

  test('keeps one service: a second save replaces the first', async ({ assert }) => {
    await saveWebSearch(WebSearchKind.Linkup, 'lk-first-1111')
    await saveWebSearch(WebSearchKind.Linkup, KEY)
    const rows = await db.from(TABLE)
    assert.lengthOf(rows, 1)
    assert.equal(rows[0].key_hint, 'abcd')
  })

  test('a key that does not open reads as no service', async ({ assert }) => {
    await saveWebSearch(WebSearchKind.Linkup, KEY)
    await db.from(TABLE).update({ sealed_key: 'garbage' })

    assert.isNull(await savedWebSearch())
    assert.isNull(await webSearchKey())
    assert.isFalse(await webSearchReady())
  })

  test('deleting leaves no row', async ({ assert }) => {
    await saveWebSearch(WebSearchKind.Linkup, KEY)
    await deleteWebSearch()
    assert.lengthOf(await db.from(TABLE), 0)
    assert.isNull(await savedWebSearch())
  })
})
