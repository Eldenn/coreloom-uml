import { type CodeMap, compare, dirname, type EntryKind } from './code-map.ts'

export type CodeMapSummary = {
  /** Folders down to `depth` levels, with the files they hold (nested ones included). */
  folders: { path: string; files: number }[]
  /** The extractor's clusters, largest first, with the folder most of their nodes are in. */
  communities: { id: number; size: number; folder: string }[]
  entries: { key: string; name: string; kind: EntryKind; path: string; line?: number }[]
  counts: { files: number; symbols: number; modules: number; edges: number }
}

/** What the map's page lists: folders, communities, entry points and counts. */
export function summarizeCodeMap(map: CodeMap, depth = 3): CodeMapSummary {
  const folders = new Map<string, number>()
  const communities = new Map<number, Map<string, number>>()
  const counts = { files: 0, symbols: 0, modules: 0, edges: map.edges.length }
  const entries: CodeMapSummary['entries'] = []

  for (const node of map.nodes) {
    if (node.kind === 'module') counts.modules += 1
    else if (node.kind === 'file') counts.files += 1
    else counts.symbols += 1
    if (node.path === undefined) continue
    const folder = dirname(node.path)
    if (node.kind === 'file') {
      const segments = folder === '' ? [] : folder.split('/')
      for (let level = 1; level <= Math.min(depth, segments.length); level += 1) {
        const path = segments.slice(0, level).join('/')
        folders.set(path, (folders.get(path) ?? 0) + 1)
      }
    }
    if (node.community !== undefined) {
      const byFolder = communities.get(node.community) ?? new Map<string, number>()
      byFolder.set(folder, (byFolder.get(folder) ?? 0) + 1)
      communities.set(node.community, byFolder)
    }
    if (node.entry) {
      entries.push({
        key: node.key,
        name: node.name,
        kind: node.entry,
        path: node.path,
        ...(node.line !== undefined ? { line: node.line } : {}),
      })
    }
  }

  return {
    folders: [...folders]
      .map(([path, files]) => ({ path, files }))
      .sort((a, b) => compare(a.path, b.path)),
    communities: [...communities]
      .map(([id, byFolder]) => {
        let size = 0
        let folder = ''
        let best = -1
        for (const [path, count] of [...byFolder].sort((a, b) => compare(a[0], b[0]))) {
          size += count
          if (count > best) {
            best = count
            folder = path
          }
        }
        return { id, size, folder }
      })
      .sort((a, b) => b.size - a.size || a.id - b.id),
    entries: entries.sort((a, b) => compare(a.kind, b.kind) || compare(a.key, b.key)),
    counts,
  }
}
