import { z } from 'zod'

/**
 * A code map: the structure of a repository (files, symbols and the links between them) in a
 * format of our own, so that the extractor that produced it stays replaceable. It holds names,
 * paths and links only, never source code.
 */

/** The version of this format. A change that an older reader would misread bumps it. */
export const CODE_MAP_VERSION = 1

export const NODE_KINDS = ['file', 'class', 'function', 'method', 'variable', 'module'] as const
export type CodeNodeKind = (typeof NODE_KINDS)[number]

/**
 * `contains`: a file holds a symbol, a class holds a method. `imports`: any import, re-export or
 * dynamic import. `calls`: a call, or a function passed to be called (`confidence: inferred`).
 * `references`: a type named by a field, a parameter or a return value.
 */
export const EDGE_KINDS = [
  'contains',
  'imports',
  'calls',
  'extends',
  'implements',
  'references',
] as const
export type CodeEdgeKind = (typeof EDGE_KINDS)[number]

/** `extracted`: read as written in the code. `inferred`: deduced by the extractor. */
export const CONFIDENCES = ['extracted', 'inferred'] as const
export type CodeConfidence = (typeof CONFIDENCES)[number]

/** Where a process starts: an HTTP route, a background job, a CLI command, an event handler. */
export const ENTRY_KINDS = ['route', 'job', 'command', 'handler'] as const
export type EntryKind = (typeof ENTRY_KINDS)[number]

export const CODE_MAP_LIMITS = {
  nodes: 100_000,
  edges: 500_000,
  /** Names and annotations are cut to this length. */
  name: 200,
  path: 1024,
  annotations: 20,
} as const

/** A path relative to the repository root, with `/` separators and no `.` or `..` segment. */
const repoPath = z
  .string()
  .min(1)
  .max(CODE_MAP_LIMITS.path)
  .refine(isRepoPath, { message: 'Expected a relative path inside the repository' })

const name = z.string().min(1).max(CODE_MAP_LIMITS.name)

export const codeNodeSchema = z.object({
  /**
   * Stable across commits, unlike the extractor's own ids: the path for a file (`src/a.ts`),
   * `path#Name` for a symbol, `path#Class.method` for a method, `module:name` for a package the
   * code imports from outside the repository.
   */
  key: z
    .string()
    .min(1)
    .max(CODE_MAP_LIMITS.path + CODE_MAP_LIMITS.name + 32),
  name,
  kind: z.enum(NODE_KINDS),
  /** Absent for a module from outside the repository. */
  path: repoPath.optional(),
  line: z.number().int().positive().optional(),
  /** The cluster the extractor put it in. */
  community: z.number().int().nonnegative().optional(),
  entry: z.enum(ENTRY_KINDS).optional(),
  /** Decorator or annotation names, without arguments: `Get`, `Controller`. */
  annotations: z.array(name).max(CODE_MAP_LIMITS.annotations).optional(),
})
export type CodeNode = z.infer<typeof codeNodeSchema>

export const codeEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  kind: z.enum(EDGE_KINDS),
  confidence: z.enum(CONFIDENCES),
})
export type CodeEdge = z.infer<typeof codeEdgeSchema>

export const codeMapHeaderSchema = z.object({
  version: z.literal(CODE_MAP_VERSION),
  extractor: z.object({ name, version: name }),
  repository: z.string().max(CODE_MAP_LIMITS.path).optional(),
  branch: z.string().max(CODE_MAP_LIMITS.name).optional(),
  commit: z
    .string()
    .regex(/^[0-9a-f]{7,64}$/i)
    .optional(),
  /** When the extractor ran, as an ISO 8601 date. */
  generatedAt: z.iso.datetime({ offset: true }).optional(),
  nodeCount: z.number().int().nonnegative(),
  edgeCount: z.number().int().nonnegative(),
})
export type CodeMapHeader = z.infer<typeof codeMapHeaderSchema>

export const codeMapSchema = z
  .object({
    header: codeMapHeaderSchema,
    nodes: z.array(codeNodeSchema).max(CODE_MAP_LIMITS.nodes),
    edges: z.array(codeEdgeSchema).max(CODE_MAP_LIMITS.edges),
  })
  .superRefine((map, context) => {
    const keys = new Set<string>()
    for (const [index, node] of map.nodes.entries()) {
      if (keys.has(node.key)) {
        context.addIssue({
          code: 'custom',
          path: ['nodes', index, 'key'],
          message: `Duplicate key ${node.key}`,
        })
      }
      keys.add(node.key)
    }
    for (const [index, edge] of map.edges.entries()) {
      for (const end of ['from', 'to'] as const) {
        if (!keys.has(edge[end])) {
          context.addIssue({
            code: 'custom',
            path: ['edges', index, end],
            message: `Unknown node ${edge[end]}`,
          })
        }
      }
    }
    if (map.header.nodeCount !== map.nodes.length || map.header.edgeCount !== map.edges.length) {
      context.addIssue({
        code: 'custom',
        path: ['header'],
        message: 'The header counts do not match the nodes and edges',
      })
    }
  })
export type CodeMap = z.infer<typeof codeMapSchema>

export type CodeMapParseResult = { ok: true; map: CodeMap } | { ok: false; problems: string[] }

/** Checks a code map received from outside (the CLI, an upload). */
export function parseCodeMap(value: unknown): CodeMapParseResult {
  const result = codeMapSchema.safeParse(value)
  if (result.success) return { ok: true, map: result.data }
  return {
    ok: false,
    problems: result.error.issues
      .slice(0, 20)
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
  }
}

export function isControlCharacter(char: string): boolean {
  const code = char.charCodeAt(0)
  return code < 0x20 || code === 0x7f
}

export function isRepoPath(path: string): boolean {
  if (path.startsWith('/') || path.endsWith('/') || path.includes('\\')) return false
  if (/^[A-Za-z]:/.test(path) || [...path].some(isControlCharacter)) return false
  return path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
}

/** A folder is not a node: links to one use its path with a trailing slash (`apps/api/`). */
export function folderKey(path: string): string {
  return `${path}/`
}

export function isFolderKey(key: string): boolean {
  return key.endsWith('/')
}

/** The folder a path is in, `''` at the root. */
export function dirname(path: string): string {
  const index = path.lastIndexOf('/')
  return index === -1 ? '' : path.slice(0, index)
}

/** Whether `path` is `folder` or lies inside it; everything lies inside the root (`''`). */
export function within(path: string, folder: string): boolean {
  return folder === '' || path === folder || path.startsWith(`${folder}/`)
}

/** Plain code-unit order, the same on every machine (no locale). */
export function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
