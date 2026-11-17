import { describe, expect, it } from 'vitest'

import {
  describeMatchFinding,
  diagramElementNames,
  MATCH_FINDING_LEVELS,
  reachesLevel,
} from './conformance.ts'

describe('conformance levels', () => {
  it('weighs what the code contradicts as an error, what the diagram lacks as a warning', () => {
    expect(MATCH_FINDING_LEVELS).toEqual({
      'missing-in-code': 'error',
      'relation-not-in-code': 'error',
      'stale-link': 'warning',
      'dependency-not-drawn': 'warning',
    })
  })

  it('counts errors under a warning threshold, never warnings under an error one', () => {
    expect(reachesLevel('error', 'error')).toBe(true)
    expect(reachesLevel('warning', 'error')).toBe(false)
    expect(reachesLevel('error', 'warning')).toBe(true)
    expect(reachesLevel('warning', 'warning')).toBe(true)
  })
})

describe('describeMatchFinding', () => {
  const names = diagramElementNames({
    kind: 'package',
    elements: [
      { id: 'api', label: 'apps/api' },
      { id: 'web', label: ' ' },
    ],
    relations: [],
  })
  const nameOf = (id: string) => names.get(id) ?? id

  it('names the elements as the diagram shows them, the id when the label is blank', () => {
    expect(names).toEqual(
      new Map([
        ['api', 'apps/api'],
        ['web', 'web'],
      ]),
    )
    expect(diagramElementNames({ kind: 'state' })).toEqual(new Map())
  })

  it('says one sentence per kind of finding', () => {
    expect(describeMatchFinding({ kind: 'missing-in-code', elementId: 'api' }, nameOf)).toBe(
      'apps/api is not in the code',
    )
    expect(
      describeMatchFinding({ kind: 'stale-link', elementId: 'api', codeKey: 'apps/old/' }, nameOf),
    ).toBe('apps/api is linked to apps/old/, which is no longer in the code')
    expect(
      describeMatchFinding({ kind: 'relation-not-in-code', from: 'api', to: 'web' }, nameOf),
    ).toBe('apps/api → web is drawn, but the code has no such dependency')
    expect(
      describeMatchFinding({
        kind: 'dependency-not-drawn',
        from: 'web',
        to: 'api',
        count: 1,
        evidence: [],
      }),
    ).toBe("web depends on api in the code (1 link), but the diagram doesn't show it")
  })
})
