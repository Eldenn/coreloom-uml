import { buildCodeGraph, type CodeGraph, edgesOf, isTestPath } from './code-graph.ts'
import type { CodeMap, CodeNode, EntryKind } from './code-map.ts'

/**
 * Finds where processes start, from the map alone: the extractor knows no route, job or command,
 * so they are recognised by conventions of the common frameworks.
 *
 * - Decorators: `@Get()`, `@Post()`… (NestJS), `@GetMapping` (Spring), `@Cron`, `@Process`,
 *   `@MessagePattern`, `@OnEvent`, `@Command`…
 * - AdonisJS: the public methods of the controllers that `start/routes.ts` imports.
 * - Express, Koa, Fastify, Hono: functions handed to a router or an app in a file that imports
 *   one (the extractor marks them as inferred calls).
 * - Jobs: `process`/`handle` of a class in a `*_job` file or a `jobs/` folder; a BullMQ (or Bull,
 *   Agenda…) worker declared in a file that imports one.
 * - Commands: `run`/`handle`/`execute` of a class in a `commands/` folder.
 * - Handlers: public methods and functions in `listeners/`, `subscribers/`, `handlers/` or
 *   `consumers/` folders.
 *
 * Tests never count. A node gets one kind, the first rule above that matches.
 */

const normalize = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '')

const ROUTE_ANNOTATIONS = new Set(
  [
    'Get',
    'Post',
    'Put',
    'Patch',
    'Delete',
    'Head',
    'Options',
    'All',
    'Route',
    'RequestMapping',
    'GetMapping',
    'PostMapping',
    'PutMapping',
    'PatchMapping',
    'DeleteMapping',
    'HttpGet',
    'HttpPost',
    'HttpPut',
    'HttpPatch',
    'HttpDelete',
    'api_view',
  ].map(normalize),
)
const JOB_ANNOTATIONS = new Set(
  ['Cron', 'Interval', 'Timeout', 'Process', 'Scheduled', 'shared_task', 'periodic_task'].map(
    normalize,
  ),
)
const HANDLER_ANNOTATIONS = new Set(
  [
    'MessagePattern',
    'EventPattern',
    'OnEvent',
    'SubscribeMessage',
    'EventListener',
    'KafkaListener',
    'RabbitListener',
    'JmsListener',
    'SqsListener',
    'RabbitSubscribe',
  ].map(normalize),
)
const COMMAND_ANNOTATIONS = new Set(['Command'].map(normalize))

const HTTP_MODULES = new Set(['express', 'koa', 'koa_router', 'fastify', 'hono', 'restify'])
const QUEUE_MODULES = new Set(['bullmq', 'bull', 'bee_queue', 'agenda', 'pg_boss', 'node_cron'])

const JOB_METHODS = new Set(['process', 'handle', 'run', 'perform', 'execute'])
const COMMAND_METHODS = new Set(['run', 'handle', 'execute', 'exec', 'main'])

const ROUTES_FILE = /(?:^|\/)start\/routes(?:\.[cm]?[jt]s$|\/[^/]+\.[cm]?[jt]s$)/
const JOB_FILE = /(?:^|\/)(?:jobs\/[^/]+|[^/]+_job\.[^/.]+)$/
const COMMAND_FILE = /(?:^|\/)commands\/(?:[^/]+\/)*[^/]+$/
const HANDLER_FILE = /(?:^|\/)(?:listeners|subscribers|handlers|consumers)\/(?:[^/]+\/)*[^/]+$/

/** The part of a method's name after its class: `ProjectsController.index` → `index`. */
function memberName(node: CodeNode): string {
  return node.name.slice(node.name.lastIndexOf('.') + 1)
}

function isPublicMethod(node: CodeNode): boolean {
  const name = memberName(node)
  return node.kind === 'method' && name !== 'constructor' && !/^[#_]/.test(name)
}

function annotationKind(node: CodeNode): EntryKind | undefined {
  const names = (node.annotations ?? []).map(normalize)
  if (names.some((name) => ROUTE_ANNOTATIONS.has(name))) return 'route'
  if (names.some((name) => HANDLER_ANNOTATIONS.has(name))) return 'handler'
  if (names.some((name) => JOB_ANNOTATIONS.has(name))) return 'job'
  if (names.some((name) => COMMAND_ANNOTATIONS.has(name))) return 'command'
  return undefined
}

function classesIn(graph: CodeGraph, path: string): CodeNode[] {
  return (graph.byPath.get(path) ?? []).filter((node) => node.kind === 'class')
}

function methodsOf(graph: CodeGraph, node: CodeNode): CodeNode[] {
  return (graph.children.get(node.key) ?? []).filter((child) => child.kind === 'method')
}

/** Each rule adds what it finds to `found`, without replacing a kind an earlier rule set. */
type Found = Map<string, EntryKind>

function mark(found: Found, node: CodeNode | undefined, kind: EntryKind) {
  if (node?.path !== undefined && !isTestPath(node.path) && !found.has(node.key)) {
    found.set(node.key, kind)
  }
}

function byAnnotations(graph: CodeGraph, found: Found) {
  for (const node of graph.map.nodes) {
    const kind = annotationKind(node)
    if (!kind) continue
    if (node.kind === 'class' && kind === 'command') {
      // `@Command()` sits on the class; the work is in its `run`.
      for (const method of methodsOf(graph, node)) {
        if (COMMAND_METHODS.has(memberName(method))) mark(found, method, 'command')
      }
    } else if (node.kind !== 'class') mark(found, node, kind)
  }
}

function byAdonisRoutes(graph: CodeGraph, found: Found) {
  const controllerFiles = new Set<string>()
  for (const [path, nodes] of graph.byPath) {
    if (!ROUTES_FILE.test(path)) continue
    for (const node of nodes) {
      for (const edge of edgesOf(graph, node.key, 'imports')) {
        const target = graph.byKey.get(edge.to)
        if (target?.path !== undefined && target.path !== path) controllerFiles.add(target.path)
      }
    }
  }
  for (const path of controllerFiles) {
    for (const node of classesIn(graph, path)) {
      if (!/Controller$/.test(node.name) && !/(?:^|\/)controllers\//.test(path)) continue
      for (const method of methodsOf(graph, node)) {
        if (isPublicMethod(method)) mark(found, method, 'route')
      }
    }
  }
}

function byHttpFrameworks(graph: CodeGraph, found: Found) {
  for (const [path, modules] of graph.modulesByPath) {
    if (![...modules].some((name) => HTTP_MODULES.has(name))) continue
    // Top-level code (the file itself) and the app or router variables declared in it.
    const sources = (graph.byPath.get(path) ?? []).filter(
      (node) => node.kind === 'file' || node.kind === 'variable',
    )
    for (const source of sources) {
      for (const edge of edgesOf(graph, source.key, 'calls')) {
        const target = graph.byKey.get(edge.to)
        if (
          edge.confidence === 'inferred' &&
          (target?.kind === 'function' || target?.kind === 'method')
        ) {
          mark(found, target, 'route')
        }
      }
    }
  }
}

function byJobs(graph: CodeGraph, found: Found) {
  for (const [path, nodes] of graph.byPath) {
    if (JOB_FILE.test(path)) {
      for (const node of nodes.filter((item) => item.kind === 'class')) {
        for (const method of methodsOf(graph, node)) {
          if (JOB_METHODS.has(memberName(method))) mark(found, method, 'job')
        }
      }
    }
    const modules = graph.modulesByPath.get(path)
    if (modules && [...modules].some((name) => QUEUE_MODULES.has(name))) {
      for (const node of nodes) {
        if (node.kind === 'variable' && edgesOf(graph, node.key, 'calls').length > 0) {
          mark(found, node, 'job')
        }
      }
    }
  }
}

function byCommands(graph: CodeGraph, found: Found) {
  for (const path of graph.byPath.keys()) {
    if (!COMMAND_FILE.test(path)) continue
    for (const node of classesIn(graph, path)) {
      for (const method of methodsOf(graph, node)) {
        if (COMMAND_METHODS.has(memberName(method))) mark(found, method, 'command')
      }
    }
  }
}

function byHandlers(graph: CodeGraph, found: Found) {
  for (const [path, nodes] of graph.byPath) {
    if (!HANDLER_FILE.test(path)) continue
    for (const node of nodes) {
      if (isPublicMethod(node) || node.kind === 'function') mark(found, node, 'handler')
    }
  }
}

/** The map with `entry` set on every entry point found, and cleared everywhere else. */
export function detectEntryPoints(map: CodeMap): CodeMap {
  const graph = buildCodeGraph(map)
  const found: Found = new Map()
  byAnnotations(graph, found)
  byAdonisRoutes(graph, found)
  byHttpFrameworks(graph, found)
  byJobs(graph, found)
  byCommands(graph, found)
  byHandlers(graph, found)

  const nodes = map.nodes.map((node) => {
    const { entry: _previous, ...rest } = node
    const entry = found.get(node.key)
    return entry ? { ...rest, entry } : rest
  })
  return { ...map, nodes }
}
