import { describe, expect, it } from 'vitest'

import type { CodeMap } from './code-map.ts'
import { flowSlice } from './flows.ts'
import { OUTLINE_QUERY_LIMITS, outlineCodeMap, queryWords } from './outline.ts'
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

describe('queryWords', () => {
  it('keeps distinct lowercase words of 3 letters or more, 8 at most', () => {
    expect(queryWords('La séquence de Update, update ! ok')).toEqual(['séquence', 'update'])
    expect(queryWords('a b c d e f g h i j aaa bbb ccc ddd eee fff ggg hhh iii')).toHaveLength(8)
  })
})

describe('outlineCodeMap with a query', () => {
  const small = { maxClasses: 1, maxStarts: 1, maxFolders: 1 }
  const JOB = `${APP}/jobs/refresh-skills_job.ts#RefreshSkillsJob`
  const ASSERT_OWNER = `${APP}/shared/authorization/assert-owner.ts#assertOwner`
  const SERIALIZERS = `${APP}/architectures/serializers/`

  it('adds the matching classes, functions and folders the outline left out', () => {
    const plain = outlineCodeMap(map, small)
    const asked = outlineCodeMap(map, {
      ...small,
      query: 'RefreshSkillsJob assertOwner serializers',
    })
    // What the outline already had stays first, in the same order.
    expect(asked.classes.slice(0, plain.classes.length)).toEqual(plain.classes)
    expect(asked.starts.slice(0, plain.starts.length)).toEqual(plain.starts)
    expect(asked.folders.slice(0, plain.folders.length)).toEqual(plain.folders)
    expect(plain.classes.map((item) => item.key)).not.toContain(JOB)
    expect(asked.classes.filter((item) => item.key === JOB)).toHaveLength(1)
    expect(asked.folders.filter((folder) => folder.key === SERIALIZERS)).toHaveLength(1)
    // A function other code calls is no start of a process: it reads `function`.
    expect(asked.starts.filter((start) => start.key === ASSERT_OWNER)).toEqual([
      expect.objectContaining({ kind: 'function', name: 'assertOwner' }),
    ])
    // The job's entry point matches too, and keeps its kind.
    expect(asked.starts.find((start) => start.key === `${JOB}.process`)?.kind).toBe('job')
  })

  it('adds nothing twice', () => {
    const asked = outlineCodeMap(map, { query: 'architectures update' })
    for (const list of [asked.classes, asked.starts, asked.folders]) {
      const keys = list.map((item) => item.key)
      expect(new Set(keys).size).toBe(keys.length)
    }
  })

  it('changes nothing without a usable word', () => {
    expect(outlineCodeMap(map, { query: 'ok ?' })).toEqual(outlineCodeMap(map))
  })

  it('caps what it adds and ranks it: more words, then entry points, roots, functions', () => {
    const plain = outlineCodeMap(map, small)
    const asked = outlineCodeMap(map, { ...small, query: 'app' })
    expect(asked.classes.length - plain.classes.length).toBeLessThanOrEqual(
      OUTLINE_QUERY_LIMITS.classes,
    )
    expect(asked.starts.length - plain.starts.length).toBe(OUTLINE_QUERY_LIMITS.starts)
    expect(asked.folders.length - plain.folders.length).toBeLessThanOrEqual(
      OUTLINE_QUERY_LIMITS.folders,
    )
    // Entry points come before roots, and roots before the functions other code calls.
    const rank = (kind: string) => (kind === 'function' ? 2 : kind === 'root' ? 1 : 0)
    const one = outlineCodeMap(map, { ...small, query: 'architecture' })
    const added = one.starts.slice(plain.starts.length).map((start) => rank(start.kind))
    expect(added).toContain(0)
    expect(added).toContain(2)
    expect(added).toEqual([...added].sort((a, b) => a - b))

    // Two words matched beat one: the update route of projects before any other start.
    const two = outlineCodeMap(map, { ...small, query: 'projects update' })
    expect(two.starts[plain.starts.length]?.key).toBe(
      `${APP}/projects/controllers/projects-controller.ts#ProjectsController.update`,
    )
  })

  it('leaves tests out', () => {
    const tested: CodeMap = {
      ...map,
      nodes: [
        ...map.nodes,
        {
          key: 'tests/zebra.spec.ts#zebra',
          kind: 'function',
          name: 'zebra',
          path: 'tests/zebra.spec.ts',
        },
      ],
    }
    expect(outlineCodeMap(tested, { query: 'zebra' })).toEqual(outlineCodeMap(tested))
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
