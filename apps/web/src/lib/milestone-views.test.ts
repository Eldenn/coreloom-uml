import { expect, test } from 'vitest'

import { pairViews } from './milestone-views'

test('pairs views by diagram: kept, added, then removed', () => {
  const before = [
    { id: 1, title: 'Context' },
    { id: 2, title: 'Flow' },
  ]
  const after = [
    { id: 3, title: 'Later' },
    { id: 1, title: 'Renamed' },
  ]

  expect(pairViews(before, after)).toEqual([
    { after: { id: 3, title: 'Later' } },
    { before: { id: 1, title: 'Context' }, after: { id: 1, title: 'Renamed' } },
    { before: { id: 2, title: 'Flow' } },
  ])
})
