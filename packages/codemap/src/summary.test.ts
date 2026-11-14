import { describe, expect, it } from 'vitest'

import { summarizeCodeMap } from './summary.ts'
import { fixtureMap } from './test-fixtures.ts'

describe('summarizeCodeMap', () => {
  it('counts files, folders, communities and lists entry points', () => {
    const summary = summarizeCodeMap(fixtureMap('adonis'), 2)
    expect(summary.counts).toEqual({ files: 21, symbols: 76, modules: 6, edges: 218 })
    expect(summary.folders).toEqual([
      { path: 'apps', files: 21 },
      { path: 'apps/api', files: 21 },
    ])
    expect(summary.communities[0]).toEqual({
      id: 9,
      size: 34,
      folder: 'apps/api/app/architectures/validators',
    })
    expect(summary.entries.map((entry) => entry.kind)).toEqual([
      'command',
      'job',
      ...Array.from({ length: 11 }, () => 'route'),
    ])
    expect(summary.entries[0]).toEqual({
      key: 'apps/api/commands/skills-refresh.ts#SkillsRefresh.run',
      name: 'SkillsRefresh.run',
      kind: 'command',
      path: 'apps/api/commands/skills-refresh.ts',
      line: 12,
    })
  })
})
