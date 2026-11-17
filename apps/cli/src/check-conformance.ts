import { CONFORMANCE_LEVELS, type ConformanceLevel, reachesLevel } from '@coreloom-uml/codemap'
import type { FetchLike } from './api.ts'
import { type ConformanceReport, fetchConformance } from './code-maps-api.ts'
import { CliError, ExitCode } from './errors.ts'
import type { Io } from './io.ts'
import { readManifest } from './manifest.ts'
import { type MapPushOptions, parseProjectId, plural, pushCodeMap } from './map-push.ts'
import type { CommandRunner } from './run-command.ts'
import { API_KEY_ENV, resolveApiKey, resolveApiUrl } from './settings.ts'

export type CheckConformanceOptions = {
  cwd: string
  io: Io
  env?: NodeJS.ProcessEnv
  apiUrl?: string
  /** The project's id; else the one in `.coreloom-uml.json`, when it names a project. */
  project?: string
  /** A code map of the project; its newest ready one when left out. */
  map?: string
  /** Map the code and send the map first (`map push`), then check against that map. */
  push?: boolean
  /** With `push`: a `graph.json` to send instead of running graphify. */
  graph?: string
  /** The level a finding must reach to fail the check: `error` (default) or `warning`. */
  failOn?: string
  /** Print one JSON object instead of text. */
  json?: boolean
  fetch?: FetchLike
  run?: CommandRunner
  now?: () => Date
}

function parseLevel(raw: string | undefined): ConformanceLevel {
  if (raw === undefined) return 'error'
  if ((CONFORMANCE_LEVELS as readonly string[]).includes(raw)) return raw as ConformanceLevel
  throw new CliError(`Invalid --fail-on: ${raw} (expected ${CONFORMANCE_LEVELS.join(' or ')}).`)
}

function parseMapId(raw: string): number {
  const id = Number(raw)
  if (!Number.isInteger(id) || id < 1) throw new CliError(`Invalid code map id: ${raw}`)
  return id
}

function counted(counts: ConformanceReport['counts']): string {
  return `${plural(counts.error, 'error')}, ${plural(counts.warning, 'warning')}`
}

/** The findings that reach `failOn`, across every diagram. */
function failing(report: ConformanceReport, failOn: ConformanceLevel): number {
  return failOn === 'warning' ? report.counts.error + report.counts.warning : report.counts.error
}

function printReport(
  io: Io,
  projectId: number,
  report: ConformanceReport,
  failOn: ConformanceLevel,
) {
  const { codeMap } = report
  const label = [
    codeMap.branch && `branch ${codeMap.branch}`,
    codeMap.commitSha && `commit ${codeMap.commitSha.slice(0, 12)}`,
  ].filter(Boolean)
  io.log(
    `Diagrams of project ${projectId} against code map ${codeMap.id}` +
      `${label.length > 0 ? ` (${label.join(', ')})` : ''}:`,
  )
  if (report.diagrams.length === 0) io.log('  No diagram the map can check.')
  for (const diagram of report.diagrams) {
    io.log(
      `  ${diagram.architectureTitle} / ${diagram.title} (${diagram.kind}): ` +
        (diagram.findings.length === 0 ? 'matches the code' : counted(diagram.counts)),
    )
    const sorted = [...diagram.findings].sort(
      (a, b) => Number(b.level === 'error') - Number(a.level === 'error'),
    )
    for (const finding of sorted) {
      const mark = reachesLevel(finding.level, failOn) ? '✗' : '!'
      io.log(`    ${mark} ${finding.level.padEnd(7)} ${finding.message}`)
    }
  }
  if (report.notChecked > 0) {
    io.log(
      `${plural(report.notChecked, 'diagram')} not checked: a kind the map has no counterpart ` +
        'for (state, ER, use case, activity, deployment), or nothing drawn yet.',
    )
  }
  if (report.undocumentedProcesses > 0) {
    io.log(
      `${report.undocumentedProcesses} ${report.undocumentedProcesses === 1 ? 'process' : 'processes'} no diagram documents (listed in the ` +
        "project's Code tab); they never fail the check.",
    )
  }
}

/**
 * `check --conformance`: asks the API how the project's diagrams match a map of its code (the
 * deterministic match, no model) and fails when a finding reaches `--fail-on`. With `--push`,
 * maps the repository and sends the map first, then checks against that map.
 */
export async function checkConformance(options: CheckConformanceOptions): Promise<ExitCode> {
  const { cwd } = options
  const env = options.env ?? process.env
  const failOn = parseLevel(options.failOn)
  // With --json, stdout holds the object only: what `map push` says goes to stderr.
  const io: Io = options.json ? { ...options.io, log: options.io.warn } : options.io
  if (options.push && options.map) {
    throw new CliError('Pass either --push or --map, not both.')
  }
  if (options.graph && !options.push) {
    throw new CliError('--graph is only read with --push.')
  }
  const codeMapId = options.map ? parseMapId(options.map) : undefined

  const manifest = await readManifest(cwd).catch(() => null)
  const projectRaw =
    options.project ??
    (manifest && 'projectId' in manifest ? String(manifest.projectId) : undefined)
  if (!projectRaw) {
    throw new CliError(
      'No project: pass --project <id> (the id in the URL of the project page, /projects/<id>).',
    )
  }
  const projectId = parseProjectId(projectRaw)
  const apiUrl = resolveApiUrl(options.apiUrl, manifest?.apiUrl, env)
  const apiKey = await resolveApiKey(env)
  if (!apiKey) {
    throw new CliError(
      `No API key: set ${API_KEY_ENV} or run \`coreloom-uml config set-key\` (the key needs ` +
        `the read ability${options.push ? ', and write for --push' : ''}).`,
    )
  }

  let checkedMap = codeMapId
  if (options.push) {
    const pushOptions: MapPushOptions = {
      cwd,
      io,
      env,
      apiUrl,
      project: String(projectId),
      ...(options.graph ? { graph: options.graph } : {}),
      ...(options.fetch ? { fetch: options.fetch } : {}),
      ...(options.run ? { run: options.run } : {}),
      ...(options.now ? { now: options.now } : {}),
    }
    const stored = await pushCodeMap(pushOptions)
    checkedMap = stored?.id
  }

  const report = await fetchConformance({
    apiUrl,
    apiKey,
    projectId,
    ...(checkedMap !== undefined ? { codeMapId: checkedMap } : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
  })
  const failed = failing(report, failOn)
  const exitCode = failed > 0 ? ExitCode.Nonconformant : ExitCode.Ok

  if (options.json) {
    options.io.log(JSON.stringify({ ok: failed === 0, exitCode, failOn, projectId, ...report }))
    return exitCode
  }
  printReport(options.io, projectId, report, failOn)
  options.io.log(
    failed > 0
      ? `Failed: ${plural(failed, 'finding')} at ${failOn} level or above (${counted(report.counts)}).`
      : `Passed: nothing at ${failOn} level or above (${counted(report.counts)}).`,
  )
  return exitCode
}
