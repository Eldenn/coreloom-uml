import type { UmlSpec } from '@coreloom-uml/uml'
import { describe, expect, it } from 'vitest'

import { matchDiagram } from './match.ts'
import { codeSlice } from './slice.ts'
import { fixtureMap } from './test-fixtures.ts'

const map = fixtureMap('adonis')
const APP = 'apps/api/app'
const PROJECTS_CONTROLLER = `${APP}/projects/controllers/projects-controller.ts#ProjectsController`

const packages: UmlSpec = {
  kind: 'package',
  elements: [
    { id: 'app', kind: 'package', label: 'apps/api/app' },
    { id: 'architectures', kind: 'package', label: 'architectures', parent: 'app' },
    { id: 'projects', kind: 'package', label: 'projects', parent: 'app' },
    { id: 'billing', kind: 'package', label: 'billing', parent: 'app' },
  ],
  relations: [{ from: 'architectures', to: 'projects' }],
}

describe('codeSlice', () => {
  it('starts with the places the elements stand for, then what they hold', () => {
    const slice = codeSlice(map, matchDiagram(packages, map))
    expect(slice.nodes.slice(0, 3).map((node) => [node.key, node.kind])).toEqual([
      [`${APP}/`, 'folder'],
      [`${APP}/architectures/`, 'folder'],
      [`${APP}/projects/`, 'folder'],
    ])
    const keys = slice.nodes.map((node) => node.key)
    expect(keys.some((key) => key.startsWith(`${APP}/projects/`) && !key.endsWith('/'))).toBe(true)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('keeps edges between nodes of the slice only, dependencies first', () => {
    const slice = codeSlice(map, matchDiagram(packages, map))
    const keys = new Set(slice.nodes.map((node) => node.key))
    for (const edge of slice.edges) {
      expect(keys.has(edge.from) && keys.has(edge.to)).toBe(true)
    }
    const firstContains = slice.edges.findIndex((edge) => edge.kind === 'contains')
    if (firstContains !== -1) {
      expect(slice.edges.slice(firstContains).every((edge) => edge.kind === 'contains')).toBe(true)
    }
  })

  it('expands a linked class with its members and neighbours', () => {
    const diagram: UmlSpec = {
      kind: 'class',
      classes: [{ id: 'ProjectsController' }],
      relations: [],
    }
    const slice = codeSlice(map, matchDiagram(diagram, map))
    expect(slice.nodes[0]?.key).toBe(PROJECTS_CONTROLLER)
    expect(slice.nodes.some((node) => node.key.startsWith(`${PROJECTS_CONTROLLER}.`))).toBe(true)
    expect(slice.nodes.length).toBeGreaterThan(2)
  })

  it('stays under the limits and says so', () => {
    const slice = codeSlice(map, matchDiagram(packages, map), { maxNodes: 4, maxEdges: 1 })
    expect(slice.nodes).toHaveLength(4)
    expect(slice.edges.length).toBeLessThanOrEqual(1)
    expect(slice.truncated).toBe(true)
  })

  it('is empty for a diagram the map has no counterpart for', () => {
    const slice = codeSlice(map, matchDiagram({ kind: 'state' }, map))
    expect(slice).toEqual({ nodes: [], edges: [], truncated: false })
  })
})
