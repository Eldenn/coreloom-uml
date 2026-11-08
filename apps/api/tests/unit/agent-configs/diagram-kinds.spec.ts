import { DIAGRAM_KINDS as CATALOG_DIAGRAM_KINDS } from '@coreloom-uml/catalog'
import { test } from '@japa/runner'
import { DIAGRAM_KINDS } from '#app/diagrams/constants/diagram'

test.group('Agent configs - diagram kinds', () => {
  test('the skills catalog names the same diagram kinds as the API', ({ assert }) => {
    assert.sameMembers([...CATALOG_DIAGRAM_KINDS], [...DIAGRAM_KINDS])
  })
})
