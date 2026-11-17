import { describe, expect, it } from 'vitest'
import { type PackageDiagramShape, packageFolders } from './architecture-boundaries.ts'

const pkg = (id: string, parent?: string, label?: string) => ({
  id,
  kind: 'package',
  ...(label === undefined ? {} : { label }),
  ...(parent === undefined ? {} : { parent }),
})

describe('packageFolders', () => {
  it('lists every package folder, nested under its parent', () => {
    const diagrams: PackageDiagramShape[] = [
      {
        elements: [
          pkg('src'),
          pkg('domain', 'src'),
          pkg('odd', undefined, 'my package'),
          pkg('child', 'odd'),
          { id: 'Order', kind: 'class', parent: 'domain' },
        ],
        relations: [],
      },
      // No arrow: still a folder a role can be scoped to.
      { elements: [pkg('app', undefined, 'apps/api/app'), pkg('src')], relations: [] },
    ]

    expect(packageFolders(diagrams)).toEqual(['apps/api/app', 'src', 'src/domain'])
  })

  it('never lists a folder with a `.` or `..` segment', () => {
    const diagrams: PackageDiagramShape[] = [
      {
        elements: [
          pkg('here', undefined, '.'),
          pkg('inside', 'here', 'lib'),
          pkg('up', undefined, '..'),
          pkg('dotted', undefined, 'src/./x'),
          pkg('hidden', undefined, './.github'),
        ],
        relations: [],
      },
    ]

    expect(packageFolders(diagrams)).toEqual(['.github'])
  })
})
