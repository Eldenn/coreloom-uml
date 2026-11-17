import { describe, expect, it } from 'vitest'

import type { CodeMap } from './code-map.ts'
import { flowSlice } from './flows.ts'
import { outlineCodeMap } from './outline.ts'
import { structureSlice } from './structure.ts'
import { fixtureMap } from './test-fixtures.ts'

const map = fixtureMap('adonis')
const APP = 'apps/api/app'
const ARCHITECTURES = `${APP}/architectures/controllers/architectures-controller.ts#ArchitecturesController`

/** The fixture as a map where no entry point was recognised. */
function withoutEntries(source: CodeMap): CodeMap {
  return { ...source, nodes: source.nodes.map(({ entry: _entry, ...node }) => node) }
}

describe('outlineCodeMap', () => {
  it('lists folders, their imports, the most linked classes and the entry points', () => {
    const outline = outlineCodeMap(map)
    const folders = outline.folders.map((folder) => folder.key)
    expect(folders).toContain(`${APP}/architectures/`)
    // `apps/` only wraps `apps/api/`.
    expect(folders).not.toContain('apps/')
    expect(outline.dependencies[0]).toEqual({
      from: `${APP}/architectures/controllers/`,
      to: `${APP}/architectures/`,
      imports: 15,
    })
    expect(outline.classes[0]).toMatchObject({ key: ARCHITECTURES, methods: 5 })
    expect(outline.starts[0]).toMatchObject({
      key: `${ARCHITECTURES}.update`,
      kind: 'route',
      reach: 6,
    })
    expect(outline.counts).toEqual({ files: 21, symbols: 61, entries: 13 })
    expect(outline.modules[0]).toEqual({ name: 'adonisjs_core', files: 6 })
  })

  it('falls back on functions nothing calls when no entry point is recognised', () => {
    const outline = outlineCodeMap(withoutEntries(map))
    expect(outline.counts.entries).toBe(0)
    expect(outline.starts.length).toBeGreaterThan(0)
    expect(outline.starts.every((start) => start.kind === 'root' && start.reach >= 3)).toBe(true)
    expect(outline.starts.map((start) => start.key)).toContain(`${ARCHITECTURES}.update`)
  })

  it('keeps to its limits', () => {
    const outline = outlineCodeMap(map, { maxFolders: 2, maxClasses: 1, maxStarts: 3 })
    expect(outline.folders).toHaveLength(2)
    expect(outline.classes).toHaveLength(1)
    expect(outline.starts).toHaveLength(3)
  })
})

describe('flowSlice', () => {
  it('starts from an entry point or any function', () => {
    expect(flowSlice(map, `${ARCHITECTURES}.update`)?.entryKind).toBe('route')
    const root = flowSlice(withoutEntries(map), `${ARCHITECTURES}.update`)
    expect(root?.entryKind).toBe('root')
    expect(root?.nodes[0]?.key).toBe(`${ARCHITECTURES}.update`)
    expect(flowSlice(map, ARCHITECTURES)).toBeNull()
    expect(flowSlice(map, 'nowhere.ts#x')).toBeNull()
  })
})

describe('structureSlice', () => {
  it('reads one folder as its subfolders, with the imports between them', () => {
    const slice = structureSlice(map, [`${APP}/`], 'package')
    const folders = slice.nodes.filter((node) => node.kind === 'folder').map((node) => node.key)
    expect(folders).toEqual([
      `${APP}/architectures/`,
      `${APP}/jobs/`,
      `${APP}/projects/`,
      `${APP}/shared/`,
      `${APP}/skills/`,
    ])
    expect(slice.edges).toContainEqual(
      expect.objectContaining({
        from: `${APP}/architectures/`,
        to: `${APP}/projects/`,
        kind: 'imports',
      }),
    )
    expect(slice.nodes.some((node) => node.kind === 'module' && node.context)).toBe(true)
    expect(slice.nodes.filter((node) => node.kind === 'file').every((node) => node.owner)).toBe(
      true,
    )
  })

  it('draws several folders as they are', () => {
    const slice = structureSlice(map, [`${APP}/architectures/`, `${APP}/projects/`], 'component')
    expect(slice.kind).toBe('component')
    expect(slice.nodes.filter((node) => node.kind === 'folder')).toHaveLength(2)
  })

  it('lists the classes of a folder with their members and links', () => {
    const slice = structureSlice(map, [`${APP}/architectures/`], 'class')
    const classes = slice.nodes.filter((node) => node.kind === 'class' && !node.context)
    expect(classes.map((node) => node.key)).toContain(ARCHITECTURES)
    expect(slice.nodes).toContainEqual(
      expect.objectContaining({ key: `${ARCHITECTURES}.update`, owner: ARCHITECTURES }),
    )
    expect(slice.edges.length).toBeGreaterThan(0)
    expect(slice.edges.every((edge) => edge.from !== edge.to)).toBe(true)
  })
})
