import { readFile, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import { defaultGraphifyIgnore, GRAPHIFY_TESTED_VERSION } from '@coreloom-uml/codemap'
import { CliError } from './errors.ts'
import type { Io } from './io.ts'
import type { CommandRunner } from './run-command.ts'
import { API_KEY_ENV } from './settings.ts'

/** The program graphify installs (PyPI `graphifyy`). */
export const GRAPHIFY_COMMAND = 'graphify'
/** Where graphify writes its graph, under the folder it reads. */
export const GRAPHIFY_GRAPH = join('graphify-out', 'graph.json')
export const GRAPHIFY_IGNORE = '.graphifyignore'
export const GRAPHIFY_INSTALL = `uv tool install graphifyy==${GRAPHIFY_TESTED_VERSION}`

/**
 * graphify reads code with tree-sitter only: no model is called (`GRAPHIFY_BACKEND=none`) and its
 * query log is off. Nothing that looks like a key is passed on, the Coreloom UML one least of all.
 */
export function graphifyEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const clean: NodeJS.ProcessEnv = {}
  for (const [name, value] of Object.entries(env)) {
    if (name === API_KEY_ENV || /(?:API_KEY|_TOKEN|_SECRET)$/i.test(name)) continue
    clean[name] = value
  }
  return { ...clean, GRAPHIFY_BACKEND: 'none', GRAPHIFY_QUERY_LOG_DISABLE: '1' }
}

export type GraphSource =
  | { kind: 'file'; path: string }
  | { kind: 'extracted'; path: string; version: string | null }

/** Reads a `graph.json` file into a value, refusing anything that is not JSON. */
export async function readGraphFile(path: string): Promise<unknown> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new CliError(`${path} not found.`)
    throw error
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new CliError(`${path} is not valid JSON.`)
  }
}

/**
 * Where the graph comes from: the file given with `--graph`; else graphify, run on `cwd` when it
 * is installed; else the `graphify-out/graph.json` an earlier run left. graphify reads the code
 * on this machine and nothing of it is sent anywhere.
 */
export async function obtainGraph(options: {
  cwd: string
  io: Io
  run: CommandRunner
  env: NodeJS.ProcessEnv
  graph?: string
}): Promise<GraphSource> {
  const { cwd, io, run, env } = options
  if (options.graph) {
    const path = isAbsolute(options.graph) ? options.graph : resolve(cwd, options.graph)
    return { kind: 'file', path }
  }

  const graphifyOptions = { cwd, env: graphifyEnv(env) }
  const probe = await run(GRAPHIFY_COMMAND, ['--version'], graphifyOptions)
  const existing = join(cwd, GRAPHIFY_GRAPH)
  if (probe.code === null) {
    const modified = await stat(existing).then(
      (stats) => stats.mtime,
      () => null,
    )
    if (!modified) {
      throw new CliError(
        `graphify is not installed and there is no ${GRAPHIFY_GRAPH} here. Install it ` +
          `(${GRAPHIFY_INSTALL}), or pass --graph <path> to a graph.json it wrote.`,
      )
    }
    io.warn(
      `graphify is not installed: sending the ${GRAPHIFY_GRAPH} written on ` +
        `${modified.toISOString()}, which may be older than the code.`,
    )
    return { kind: 'file', path: existing }
  }

  const version = /(\d+\.\d+\.\d+\S*)/.exec(probe.stdout)?.[1] ?? null
  if (version !== GRAPHIFY_TESTED_VERSION) {
    io.warn(
      `graphify ${version ?? '(unknown version)'} found; the map is read the way graphify ` +
        `${GRAPHIFY_TESTED_VERSION} writes it (${GRAPHIFY_INSTALL}).`,
    )
  }

  const ignore = join(cwd, GRAPHIFY_IGNORE)
  try {
    await writeFile(ignore, defaultGraphifyIgnore(), { flag: 'wx' })
    io.log(`Wrote ${GRAPHIFY_IGNORE}, so that graphify skips dependencies and build output.`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }

  io.log('Reading the code with graphify (no model is called)…')
  // `--force`: the graph is rewritten even when it shrinks, since deleted code must leave the map.
  const steps = [
    ['update', '.', '--no-cluster', '--force'],
    ['cluster-only', '.', '--no-viz', '--no-label'],
  ]
  for (const args of steps) {
    const result = await run(GRAPHIFY_COMMAND, args, graphifyOptions)
    if (result.code !== 0) {
      const detail = (result.stderr.trim() || result.stdout.trim()).split('\n').slice(-10)
      throw new CliError(
        `graphify ${args[0]} failed (exit code ${result.code}):\n${detail.join('\n')}`,
      )
    }
  }
  return { kind: 'extracted', path: existing, version }
}
