import { hashManagedBlock, SLASH_MARKERS, wrapManagedBlock } from './managed-block.ts'

/** The file dependency-cruiser reads by default at the root of a repository. */
export const DEPENDENCY_CRUISER_FILE = '.dependency-cruiser.cjs'

/** What the renderer reads of a package diagram: its elements and the arrows between them. */
export type PackageDiagramShape = {
  elements: readonly { id: string; kind: string; label?: string; parent?: string }[]
  relations: readonly { from: string; to: string }[]
}

/** Folders, from the repository root, and the dependencies drawn between them (`from to`). */
type ArchitectureBoundaries = { paths: string[]; allowed: Set<string> }

/** A folder path that needs no quoting in a shell and no surprise in a regular expression. */
export const FOLDER_PATH = /^[A-Za-z0-9._@-]+(?:\/[A-Za-z0-9._@-]+)*$/

/** Whether `path` is the folder `ancestor` or lies inside it. */
function within(path: string, ancestor: string): boolean {
  return path === ancestor || path.startsWith(`${ancestor}/`)
}

function related(a: string, b: string): boolean {
  return within(a, b) || within(b, a)
}

/**
 * The folder of each element of a package diagram. A diagram has no folder paths, so a package's
 * name is taken as its folder: the name as written (`src`, `apps/api/app`), under its parent
 * package's folder when it is nested (`domain` inside `src` is `src/domain`). A package whose
 * name is not a plain folder path has none (`null`), like everything inside it. A class has the
 * folder of the package that holds it, `''` outside any package.
 */
function folderReader(diagram: PackageDiagramShape): (id: string) => string | null {
  const byId = new Map(diagram.elements.map((element) => [element.id, element]))
  const folders = new Map<string, string | null>()
  const folderOf = (id: string, depth = 0): string | null => {
    const known = folders.get(id)
    if (known !== undefined) return known
    const element = byId.get(id)
    // The depth bound stops a cycle of parents.
    if (!element || depth > diagram.elements.length) return null
    const parent = element.parent === undefined ? '' : folderOf(element.parent, depth + 1)
    let folder = parent
    if (element.kind === 'package' && parent !== null) {
      const name = (element.label ?? element.id).trim().replace(/^(?:\.?\/)+|\/+$/g, '')
      const path = parent === '' || within(name, parent) ? name : `${parent}/${name}`
      folder = FOLDER_PATH.test(path) && !path.split('/').includes('..') ? path : null
    }
    folders.set(id, folder)
    return folder
  }
  return (id) => folderOf(id)
}

/**
 * Every package folder the diagrams draw (see `folderReader`), without duplicate, sorted. A
 * diagram without any arrow counts too, and a folder with a `.` segment is left out.
 */
export function packageFolders(diagrams: readonly PackageDiagramShape[]): string[] {
  const paths = new Set<string>()
  for (const diagram of diagrams) {
    const folderOf = folderReader(diagram)
    for (const element of diagram.elements) {
      const folder = element.kind === 'package' ? folderOf(element.id) : null
      if (folder && !folder.split('/').includes('.')) paths.add(folder)
    }
  }
  return [...paths].sort()
}

/**
 * Reads folders and allowed dependencies from package diagrams (see `folderReader`). An arrow
 * from or to a class counts for the package that holds it. A diagram without any arrow between
 * two folders says nothing about dependencies and is left out whole. `null` when no diagram is
 * left: nothing can be checked.
 */
function collectBoundaries(
  diagrams: readonly PackageDiagramShape[],
): ArchitectureBoundaries | null {
  const paths = new Set<string>()
  const allowed = new Set<string>()

  for (const diagram of diagrams) {
    const folderOf = folderReader(diagram)

    const arrows: string[] = []
    for (const relation of diagram.relations) {
      const from = folderOf(relation.from)
      const to = folderOf(relation.to)
      if (from && to && !related(from, to)) arrows.push(`${from} ${to}`)
    }
    if (arrows.length === 0) continue
    for (const arrow of arrows) allowed.add(arrow)
    for (const element of diagram.elements) {
      const folder = element.kind === 'package' ? folderOf(element.id) : null
      if (folder) paths.add(folder)
    }
  }

  return paths.size === 0 ? null : { paths: [...paths].sort(), allowed }
}

const inFolder = (path: string) => `^${path.replaceAll('.', '\\.')}/`

/**
 * One `forbidden` rule per folder: its own files (the ones in no nested package) may not depend
 * on a folder it has no arrow to. An arrow covers what both of its ends contain.
 */
function forbiddenRules(boundaries: ArchitectureBoundaries) {
  const { paths, allowed } = boundaries
  const mayUse = (from: string, to: string) =>
    paths.some(
      (a) => within(from, a) && paths.some((b) => within(to, b) && allowed.has(`${a} ${b}`)),
    )

  return paths.flatMap((from) => {
    const others = paths.filter((to) => !related(from, to))
    const refused = others.filter((to) => !mayUse(from, to))
    const targets = refused.filter(
      (to) => !refused.some((other) => other !== to && within(to, other)),
    )
    if (targets.length === 0) return []
    const nested = paths.filter((path) => path !== from && within(path, from))
    const exceptions = others.filter(
      (to) => mayUse(from, to) && targets.some((target) => within(to, target)),
    )
    return [
      {
        name: `not-in-diagram:${from}`,
        severity: 'error',
        comment: `The package diagrams draw no dependency from ${from} to these packages.`,
        from: {
          path: inFolder(from),
          ...(nested.length > 0 ? { pathNot: nested.map(inFolder) } : {}),
        },
        to: {
          path: targets.map(inFolder),
          ...(exceptions.length > 0 ? { pathNot: exceptions.map(inFolder) } : {}),
        },
      },
    ]
  })
}

/**
 * The dependency-cruiser configuration for these package diagrams, in a managed block
 * (`SLASH_MARKERS`), and the command that checks it. Only folder paths go in,
 * never a title or a description. `null` when the diagrams forbid nothing.
 */
export function renderDependencyCruiser(diagrams: readonly PackageDiagramShape[]) {
  const boundaries = collectBoundaries(diagrams)
  const forbidden = boundaries ? forbiddenRules(boundaries) : []
  if (!boundaries || forbidden.length === 0) return null

  const roots = boundaries.paths.filter(
    (path) => !boundaries.paths.some((other) => other !== path && within(path, other)),
  )
  const command = `npx depcruise ${roots.join(' ')}`
  const config = { forbidden, options: { doNotFollow: { path: ['node_modules'] } } }
  const body = [
    '// Dependency rules drawn from the package diagrams in Coreloom UML: a package may only',
    '// depend on the packages it has an arrow to. A package is matched by its name, read as a',
    '// folder path from the repository root.',
    `// Check them with: ${command}`,
    '// Add your own rules and options after this block, on `module.exports`.',
    `module.exports = ${JSON.stringify(config, null, 2)}`,
  ].join('\n')
  const block = wrapManagedBlock(body, SLASH_MARKERS)
  return { content: `${block}\n`, blockHash: hashManagedBlock(block), command }
}
