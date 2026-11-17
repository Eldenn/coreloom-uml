import { describe, expect, it } from 'vitest'

import { dirname, folderKey, isRepoPath, parseCodeMap, within } from './code-map.ts'
import { fixtureMap } from './test-fixtures.ts'

describe('parseCodeMap', () => {
  it('accepts an imported map, sent as JSON', () => {
    const map = fixtureMap('frameworks')
    expect(parseCodeMap(JSON.parse(JSON.stringify(map)))).toEqual({ ok: true, map })
  })

  it('refuses duplicate keys, unknown ends, wrong counts and paths outside the repository', () => {
    const result = parseCodeMap({
      header: {
        version: 1,
        extractor: { name: 'graphify', version: '0.9.108' },
        nodeCount: 3,
        edgeCount: 1,
      },
      nodes: [
        { key: 'a.ts', name: 'a.ts', kind: 'file', path: 'a.ts' },
        { key: 'a.ts', name: 'a.ts', kind: 'file', path: 'a.ts' },
        { key: 'b', name: 'b', kind: 'file', path: '../b.ts' },
      ],
      edges: [{ from: 'a.ts', to: 'gone', kind: 'calls', confidence: 'extracted' }],
    })
    expect(result).toEqual({
      ok: false,
      problems: [
        'nodes.2.path: Expected a relative path inside the repository',
        'nodes.1.key: Duplicate key a.ts',
        'edges.0.to: Unknown node gone',
      ],
    })
    const valid = { key: 'a.ts', name: 'a.ts', kind: 'file', path: 'a.ts' }
    expect(
      parseCodeMap({
        header: { version: 1, extractor: { name: 'x', version: '1' }, nodeCount: 1, edgeCount: 1 },
        nodes: [valid, valid],
        edges: [{ from: 'a.ts', to: 'gone', kind: 'calls', confidence: 'extracted' }],
      }),
    ).toEqual({
      ok: false,
      problems: [
        'nodes.1.key: Duplicate key a.ts',
        'edges.0.to: Unknown node gone',
        'header: The header counts do not match the nodes and edges',
      ],
    })
  })
})

describe('paths', () => {
  it('accepts only relative paths inside the repository', () => {
    expect(isRepoPath('apps/api/start/routes.ts')).toBe(true)
    for (const path of [
      '/etc/passwd',
      '../a',
      'a/../b',
      'a//b',
      './a',
      'C:/a',
      'a\\b',
      'a\nb',
      'a/',
    ]) {
      expect(isRepoPath(path)).toBe(false)
    }
  })

  it('names folders and tells what lies inside one', () => {
    expect(folderKey('apps/api')).toBe('apps/api/')
    expect(dirname('apps/api/start/routes.ts')).toBe('apps/api/start')
    expect(dirname('README.md')).toBe('')
    expect(within('apps/api/start/routes.ts', 'apps/api')).toBe(true)
    expect(within('apps/apix/a.ts', 'apps/api')).toBe(false)
    expect(within('anything', '')).toBe(true)
  })
})
