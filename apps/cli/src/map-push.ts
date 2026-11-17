import { promisify } from 'node:util'
import { gzip } from 'node:zlib'
import { importGraphify } from '@coreloom-uml/codemap'
import type { FetchLike } from './api.ts'
import { type StoredCodeMap, uploadCodeMap } from './code-maps-api.ts'
import { CliError, ExitCode } from './errors.ts'
import { readGitInfo } from './git.ts'
import { obtainGraph, readGraphFile } from './graphify.ts'
import type { Io } from './io.ts'
import { readManifest } from './manifest.ts'
import { type CommandRunner, runCommand } from './run-command.ts'
import { API_KEY_ENV, resolveApiKey, resolveApiUrl } from './settings.ts'

const gzipAsync = promisify(gzip)

/** The API's upload limit (`CODE_MAP_LIMITS.uploadSize`), checked before anything is sent. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

const COMMIT = /^[0-9a-f]{7,64}$/i
/** `CODE_MAP_LIMITS.branch` in the API. */
const MAX_BRANCH_LENGTH = 200

export type MapPushOptions = {
  cwd: string
  io: Io
  env?: NodeJS.ProcessEnv
  apiUrl?: string
  /** The project's id; else the one in `.coreloom-uml.json`, when it names a project. */
  project?: string
  /** An existing `graph.json`, instead of running graphify. */
  graph?: string
  repository?: string
  branch?: string
  commit?: string
  /** Build the map and print what would be sent, without sending it. */
  dryRun?: boolean
  fetch?: FetchLike
  run?: CommandRunner
  /** The map's date, for tests. */
  now?: () => Date
}

export function parseProjectId(raw: string): number {
  const id = Number(raw)
  if (!Number.isInteger(id) || id < 1) throw new CliError(`Invalid project id: ${raw}`)
  return id
}

function parseRepositoryUrl(raw: string): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new CliError(`Invalid repository URL: ${raw}`)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new CliError(`The repository URL must use http or https: ${raw}`)
  }
  if (url.username || url.password) {
    throw new CliError('The repository URL must not carry credentials.')
  }
  return url.toString()
}

export function plural(count: number, word: string): string {
  return `${count.toLocaleString('en-US')} ${word}${count === 1 ? '' : 's'}`
}

/**
 * `map push`: maps the code of the repository at `cwd` with graphify (or reads a `graph.json`),
 * turns it into a `CodeMap` here, so that only names, paths and links leave the machine and
 * never the code, then sends it gzipped to the project. Labelled with the Git branch, commit and
 * `origin` remote unless told otherwise.
 */
export async function mapPush(options: MapPushOptions): Promise<ExitCode> {
  await pushCodeMap(options)
  return ExitCode.Ok
}

/** What `map push` does, answering with the map stored (null on a dry run). */
export async function pushCodeMap(options: MapPushOptions): Promise<StoredCodeMap | null> {
  const { cwd, io } = options
  const env = options.env ?? process.env
  const run = options.run ?? runCommand
  const dryRun = options.dryRun === true

  const manifest = await readManifest(cwd).catch(() => null)
  const projectRaw =
    options.project ??
    (manifest && 'projectId' in manifest ? String(manifest.projectId) : undefined)
  if (!projectRaw && !dryRun) {
    throw new CliError(
      'No project: pass --project <id> (the id in the URL of the project page, /projects/<id>).',
    )
  }
  const projectId = projectRaw ? parseProjectId(projectRaw) : null

  // Everything that can fail fast does, before graphify reads the code.
  let target: { apiUrl: string; apiKey: string } | null = null
  if (!dryRun) {
    const apiUrl = resolveApiUrl(options.apiUrl, manifest?.apiUrl, env)
    const apiKey = await resolveApiKey(env)
    if (!apiKey) {
      throw new CliError(
        `No API key: set ${API_KEY_ENV} or run \`coreloom-uml config set-key\` (the key needs ` +
          'the write ability).',
      )
    }
    target = { apiUrl, apiKey }
  }
  const repositoryUrl = options.repository ? parseRepositoryUrl(options.repository) : undefined
  if (options.commit && !COMMIT.test(options.commit)) {
    throw new CliError(`Invalid commit: ${options.commit} (expected a hexadecimal SHA).`)
  }

  const git = await readGitInfo(cwd, run, env)
  const label = {
    repositoryUrl: repositoryUrl ?? git.repositoryUrl,
    branch: (options.branch ?? git.branch)?.slice(0, MAX_BRANCH_LENGTH),
    commit: options.commit?.toLowerCase() ?? git.commit,
  }
  if (git.dirty && !options.graph && !options.commit) {
    io.warn(
      'The working tree has uncommitted changes: the map holds them, but is labelled with the ' +
        'last commit.',
    )
  }

  const source = await obtainGraph({
    cwd,
    io,
    run,
    env,
    ...(options.graph ? { graph: options.graph } : {}),
  })
  const graph = await readGraphFile(source.path)
  const imported = importGraphify(graph, {
    root: cwd,
    ...(label.repositoryUrl ? { repository: label.repositoryUrl } : {}),
    ...(label.branch ? { branch: label.branch } : {}),
    ...(label.commit ? { commit: label.commit } : {}),
    generatedAt: (options.now?.() ?? new Date()).toISOString(),
  })
  if (!imported.ok) {
    throw new CliError(
      [`${source.path} could not be read as a code map:`, ...imported.problems].join('\n  - '),
    )
  }

  const { map, skipped } = imported
  const entries = map.nodes.filter((node) => node.entry).length
  io.log(
    `Code map: ${plural(map.header.nodeCount, 'node')}, ${plural(map.header.edgeCount, 'link')}, ` +
      `${plural(entries, 'entry point')} (${plural(skipped.nodes, 'node')} and ` +
      `${plural(skipped.edges, 'link')} of the graph left out).`,
  )
  const labelParts = [
    label.repositoryUrl,
    label.branch && `branch ${label.branch}`,
    label.commit && `commit ${label.commit.slice(0, 12)}`,
  ].filter(Boolean)
  if (labelParts.length > 0) io.log(`Labelled with ${labelParts.join(', ')}.`)

  const gzipped = await gzipAsync(JSON.stringify(map))
  if (gzipped.byteLength > MAX_UPLOAD_BYTES) {
    throw new CliError(
      `The code map is ${(gzipped.byteLength / 1024 / 1024).toFixed(1)} MB gzipped, over the ` +
        `API's ${MAX_UPLOAD_BYTES / 1024 / 1024} MB: leave folders out in .graphifyignore.`,
    )
  }

  if (!target || projectId === null) {
    io.log(`Dry run: nothing sent (${(gzipped.byteLength / 1024).toFixed(0)} KB gzipped).`)
    return null
  }

  const stored = await uploadCodeMap({
    ...target,
    projectId,
    gzipped,
    ...(label.repositoryUrl ? { repositoryUrl: label.repositoryUrl } : {}),
    ...(label.branch ? { branch: label.branch } : {}),
    ...(label.commit ? { commitSha: label.commit } : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
  })
  io.log(
    `Code map ${stored.id} stored in project ${stored.projectId}: ` +
      `${plural(stored.nodeCount, 'node')}, ${plural(stored.edgeCount, 'link')}.`,
  )
  return stored
}
