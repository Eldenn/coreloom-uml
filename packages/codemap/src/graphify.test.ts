import { describe, expect, it } from 'vitest'

import { codeMapSchema } from './code-map.ts'
import { defaultGraphifyIgnore, importGraphify } from './graphify.ts'
import { readGraph } from './test-fixtures.ts'

const ROUTES = 'apps/api/start/routes.ts'
const CONTROLLER = 'apps/api/app/projects/controllers/projects-controller.ts'

function graph(nodes: unknown[], links: unknown[] = [], schemaVersion: unknown = 1) {
  return { graph: { schema_version: schemaVersion, graphify_version: '0.9.108' }, nodes, links }
}

function imported(value: unknown, options = {}) {
  const result = importGraphify(value, options)
  if (!result.ok) throw new Error(result.problems.join('\n'))
  return result
}

describe('importGraphify', () => {
  it('reads the reduced graph of this repository into a valid code map', () => {
    const { map, skipped } = imported(readGraph('adonis'), {
      repository: 'https://github.com/eldenn/coreloom-uml',
      branch: 'main',
      commit: 'c888ba6',
      generatedAt: '2026-11-14T01:00:00Z',
    })

    expect(codeMapSchema.safeParse(map).success).toBe(true)
    expect(map.header).toEqual({
      version: 1,
      extractor: { name: 'graphify', version: '0.9.108' },
      repository: 'https://github.com/eldenn/coreloom-uml',
      branch: 'main',
      commit: 'c888ba6',
      generatedAt: '2026-11-14T01:00:00Z',
      nodeCount: map.nodes.length,
      edgeCount: map.edges.length,
    })
    // Decorator names and the package declarations are not nodes.
    expect(skipped.nodes).toBeGreaterThan(0)

    const byKey = new Map(map.nodes.map((node) => [node.key, node]))
    expect(byKey.get(CONTROLLER)).toMatchObject({ kind: 'file', name: 'projects-controller.ts' })
    expect(byKey.get(`${CONTROLLER}#ProjectsController`)).toMatchObject({
      kind: 'class',
      path: CONTROLLER,
      line: 14,
    })
    expect(byKey.get(`${CONTROLLER}#ProjectsController.show`)).toMatchObject({
      kind: 'method',
      name: 'ProjectsController.show',
    })
    expect(
      byKey.get('apps/api/app/projects/services/owned-project.ts#findOwnedProject')?.kind,
    ).toBe('function')
    // Two `limits.ts`: graphify labels them with a longer path; both are files.
    expect(byKey.get('apps/api/app/projects/constants/limits.ts')?.kind).toBe('file')
    expect(byKey.get('apps/api/app/architectures/constants/limits.ts')?.kind).toBe('file')
    // One node per outside package, whether graphify saw it in the code or the manifest.
    expect(map.nodes.filter((node) => node.kind === 'module').map((node) => node.key)).toEqual([
      'module:@adonisjs/core',
      'module:@adonisjs/lucid',
      'module:@coreloom-uml/catalog',
      'module:@nemoventures/adonis-jobs',
      'module:@vinejs/vine',
      'module:luxon',
    ])
    expect(byKey.get('apps/api/app/projects/models/project.ts#Project')?.annotations).toEqual([
      'belongsTo',
      'column',
      'dateTime',
      'hasMany',
      'hasOne',
    ])
  })

  it('maps relations to the map’s edge kinds, read in their own direction', () => {
    const { map } = imported(readGraph('adonis'))
    const has = (from: string, to: string, kind: string) =>
      map.edges.some((edge) => edge.from === from && edge.to === to && edge.kind === kind)

    expect(has(CONTROLLER, `${CONTROLLER}#ProjectsController`, 'contains')).toBe(true)
    expect(
      has(`${CONTROLLER}#ProjectsController`, `${CONTROLLER}#ProjectsController.index`, 'contains'),
    ).toBe(true)
    expect(
      has(
        `${CONTROLLER}#ProjectsController.show`,
        'apps/api/app/projects/services/owned-project.ts#findOwnedProject',
        'calls',
      ),
    ).toBe(true)
    expect(has(`${ROUTES}#projectsController`, CONTROLLER, 'imports')).toBe(true)
    expect(has(CONTROLLER, ROUTES, 'imports')).toBe(false)
    expect(
      map.edges.find(
        (edge) =>
          edge.from === `${CONTROLLER}#ProjectsController.index` &&
          edge.to === 'apps/api/app/projects/serializers/project-serializer.ts#serializeProject',
      ),
    ).toEqual(expect.objectContaining({ kind: 'calls', confidence: 'inferred' }))
    expect(new Set(map.edges.map((edge) => edge.kind))).toEqual(
      new Set(['contains', 'imports', 'calls', 'references']),
    )
  })

  it('gives the same map for the same graph', () => {
    const first = imported(readGraph('adonis')).map
    const second = imported(readGraph('adonis')).map
    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
  })

  it('refuses an unknown schema version with a clear message', () => {
    const result = importGraphify(graph([], [], 2))
    expect(result).toEqual({
      ok: false,
      problems: [
        'Unsupported graphify schema_version 2: this importer reads version 1 (graphifyy 0.9.108).',
      ],
    })
    expect(importGraphify({ nodes: [] })).toMatchObject({ ok: false })
    expect(importGraphify('graph')).toMatchObject({ ok: false })
  })

  it('refuses a graph over the limits', () => {
    const nodes = Array.from({ length: 100_001 }, (_, index) => ({ id: `n${index}` }))
    expect(importGraphify(graph(nodes))).toEqual({
      ok: false,
      problems: ['Too many nodes: 100001, at most 100000.'],
    })
  })

  it('leaves out ignored folders, paths outside the repository and non-code nodes', () => {
    const { map } = imported(
      graph([
        { id: 'a', label: 'a.ts', source_file: '/work/repo/src/a.ts', source_location: 'L1' },
        { id: 'b', label: 'b.js', source_file: 'dist/b.js', source_location: 'L1' },
        { id: 'c', label: 'c.ts', source_file: '../c.ts', source_location: 'L1' },
        { id: 'd', label: 'README.md', source_file: 'README.md', file_type: 'document' },
        { id: 'e', label: 'tsconfig.json', source_file: 'tsconfig.json', source_location: 'L1' },
        { id: 'f', label: 'f.ts', source_file: '/elsewhere/f.ts', source_location: 'L1' },
        { id: 'g', label: 'g.ts', source_file: 'pkg/out/g.ts', source_location: 'L1' },
      ]),
      { root: '/work/repo', ignoredFolders: ['dist', 'out'] },
    )
    expect(map.nodes.map((node) => node.key)).toEqual(['src/a.ts'])
  })

  it('cleans names, keeps keys unique and keeps the surest confidence', () => {
    const long = 'x'.repeat(300)
    const { map } = imported(
      graph(
        [
          { id: 'file', label: 'a.ts', source_file: 'a.ts', source_location: 'L1' },
          { id: 'f1', label: 'run()', source_file: 'a.ts', source_location: 'L3' },
          { id: 'f2', label: 'run()', source_file: 'a.ts', source_location: 'L9' },
          { id: 'f3', label: 'run()', source_file: 'a.ts' },
          { id: 'f4', label: 'run()', source_file: 'a.ts' },
          { id: 'v', label: `bad\u0007\nname ${long}`, source_file: 'a.ts', source_location: 'L5' },
        ],
        [
          { source: 'f1', target: 'f2', relation: 'indirect_call', confidence: 'INFERRED' },
          { source: 'f1', target: 'f2', relation: 'calls', confidence: 'EXTRACTED' },
          { source: 'f1', target: 'f1', relation: 'calls', confidence: 'EXTRACTED' },
          { source: 'f1', target: 'gone', relation: 'calls', confidence: 'EXTRACTED' },
          { source: 'file', target: 'f1', relation: 'declares', confidence: 'EXTRACTED' },
        ],
      ),
    )
    expect(map.nodes.map((node) => node.key)).toEqual(
      [
        'a.ts',
        'a.ts#run',
        'a.ts#run@L9',
        'a.ts#run~2',
        'a.ts#run~3',
        `a.ts#bad name ${'x'.repeat(191)}`,
      ].sort(),
    )
    expect(map.nodes.find((node) => node.kind === 'variable')?.name).toHaveLength(200)
    expect(map.edges).toEqual([
      { from: 'a.ts#run', to: 'a.ts#run@L9', kind: 'calls', confidence: 'extracted' },
    ])
  })
})

describe('defaultGraphifyIgnore', () => {
  it('lists the ignored folders, one per line', () => {
    expect(defaultGraphifyIgnore()).toContain('node_modules/\n')
    expect(defaultGraphifyIgnore()).toContain('.adonisjs/\n')
  })
})
