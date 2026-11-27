import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { z } from 'zod'
import { Condition, type FinalState } from '../task.ts'
import {
  HARBOR_OUTPUT_LIMITS,
  SAFE_GIT_CONFIG,
  TASK_METADATA_FILE,
  TASK_NAME_SEPARATOR,
  UNSAFE_GIT_PATHS,
} from './constants.ts'
import { type TaskMetadata, trialWorkDir } from './export.ts'

export type HarborUsage = { input: number; cachedInput: number; cacheWrite: number; output: number }

export type HarborTrialResult = {
  taskId: string
  condition: Condition
  /** 1 to k, in the order the attempts of that (task, condition) started. */
  attempt: number
  /**
   * The final workspace copied back from the sandbox, made safe to hand to Git (no symbolic link,
   * a fixed `.git/config`, no hook, attribute or alternate) but still written by the agent:
   * untrusted, graded in a sandbox only, never by running or Git-reading it in the worker. Null
   * when none came back or it was refused (`stateProblem`).
   */
  state: FinalState | null
  /** Why a final workspace that came back was refused; null otherwise. */
  stateProblem: string | null
  /**
   * The text files Harbor wrote for the trial (its logs, the agent's output, results), by path
   * under the trial's folder, unfiltered. Never `artifacts/` (the workspace is `state`); each file
   * cut at `HARBOR_OUTPUT_LIMITS.fileBytes`, the trial at `trialBytes`.
   */
  outputs: readonly { path: string; text: string }[]
  /** Whether a file or the trial was cut, or a file left out, by those limits. */
  outputsCut: boolean
  /**
   * Tokens: `input` not read from nor written to a cache, `cachedInput` read from it,
   * `cacheWrite` written to it, `output` generated. Null when the agent reported none.
   */
  usage: HarborUsage | null
  /** Harbor's exception class name only, never its message. */
  error: string | null
  durationMs: number
}

/** What the poll of a running job reads: the usage so far, nothing of the outputs or the state. */
export type HarborTrialUsage = Pick<HarborTrialResult, 'taskId' | 'condition' | 'attempt' | 'usage'>

/** The fields of a trial's `result.json` the reader uses (Harbor 0.27.0, `TrialResult`). */
type TrialResultFile = {
  task_name?: string
  task_id?: { path?: string }
  started_at?: string | null
  finished_at?: string | null
  exception_info?: { exception_type?: string } | null
  agent_result?: {
    n_input_tokens?: number | null
    n_cache_tokens?: number | null
    n_output_tokens?: number | null
  } | null
}

/** Claude Code's `stream-json` result event, as its CLI prints it at the end of a run. */
type ClaudeResultEvent = {
  type?: string
  usage?: {
    input_tokens?: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
    output_tokens?: number
  }
  modelUsage?: Record<
    string,
    {
      inputTokens?: number
      cacheCreationInputTokens?: number
      cacheReadInputTokens?: number
      outputTokens?: number
    }
  >
}

const metadataSchema = z.object({
  taskId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  condition: z.enum(Object.values(Condition) as [Condition, ...Condition[]]),
  base: z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})?$/),
})

const CONDITIONS = new Set<string>(Object.values(Condition))

/** Whether `bytes` is text a filter can read: UTF-8, no NUL byte. */
function asText(bytes: Buffer): string | null {
  if (bytes.includes(0)) return null
  const text = bytes.toString('utf8')
  return Buffer.from(text, 'utf8').equals(bytes) ? text : null
}

/** Reads at most `limit` bytes of `path`, cut back to whole UTF-8 characters. */
function readCapped(path: string, limit: number): { bytes: Buffer; cut: boolean } {
  const size = statSync(path).size
  const bytes = readFileSync(path).subarray(0, limit)
  if (size <= limit) return { bytes, cut: false }
  let end = bytes.length
  // A UTF-8 continuation byte is 10xxxxxx: step back to the start of the character it ends in.
  while (end > 0 && ((bytes[end - 1] ?? 0) & 0xc0) === 0x80) end -= 1
  if (end > 0 && (bytes[end - 1] ?? 0) >= 0xc0) end -= 1
  return { bytes: bytes.subarray(0, end), cut: true }
}

/** The trial's text files, symbolic links not followed, `artifacts/` left out, within the caps. */
function trialOutputs(trialDir: string): {
  outputs: { path: string; text: string }[]
  cut: boolean
} {
  const outputs: { path: string; text: string }[] = []
  let left: number = HARBOR_OUTPUT_LIMITS.trialBytes
  let cut = false
  const walk = (folder: string) => {
    for (const name of readdirSync(folder).sort()) {
      const path = join(folder, name)
      if (relative(trialDir, path) === HARBOR_OUTPUT_LIMITS.artifactsDir) continue
      const stat = lstatSync(path)
      if (stat.isDirectory()) walk(path)
      else if (stat.isFile()) {
        if (left <= 0) {
          cut = true
          continue
        }
        const read = readCapped(path, Math.min(HARBOR_OUTPUT_LIMITS.fileBytes, left))
        const text = asText(read.bytes)
        if (text === null) continue
        cut ||= read.cut
        left -= read.bytes.length
        outputs.push({ path: relative(trialDir, path), text })
      }
    }
  }
  walk(trialDir)
  return { outputs, cut }
}

const count = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0

/** The usage of Claude Code's last `result` event in its output, every model of the run summed. */
function claudeUsage(trialDir: string): HarborUsage | null {
  const file = join(trialDir, 'agent', 'claude-code.txt')
  if (!existsSync(file) || !lstatSync(file).isFile()) return null
  let last: ClaudeResultEvent | null = null
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.startsWith('{')) continue
    try {
      const event = JSON.parse(line) as ClaudeResultEvent
      if (event.type === 'result') last = event
    } catch {
      // A line of the agent's own output that only looks like JSON.
    }
  }
  if (last === null) return null
  const models = Object.values(last.modelUsage ?? {})
  if (models.length > 0) {
    return models.reduce<HarborUsage>(
      (sum, model) => ({
        input: sum.input + count(model.inputTokens),
        cachedInput: sum.cachedInput + count(model.cacheReadInputTokens),
        cacheWrite: sum.cacheWrite + count(model.cacheCreationInputTokens),
        output: sum.output + count(model.outputTokens),
      }),
      { input: 0, cachedInput: 0, cacheWrite: 0, output: 0 },
    )
  }
  if (!last.usage) return null
  return {
    input: count(last.usage.input_tokens),
    cachedInput: count(last.usage.cache_read_input_tokens),
    cacheWrite: count(last.usage.cache_creation_input_tokens),
    output: count(last.usage.output_tokens),
  }
}

/** Harbor's totals, where `n_input_tokens` counts the cached ones too and no cache write. */
function harborUsage(result: TrialResultFile): HarborUsage | null {
  const agent = result.agent_result
  if (!agent || (agent.n_input_tokens == null && agent.n_output_tokens == null)) return null
  const cached = count(agent.n_cache_tokens)
  return {
    input: Math.max(0, count(agent.n_input_tokens) - cached),
    cachedInput: cached,
    cacheWrite: 0,
    output: count(agent.n_output_tokens),
  }
}

/**
 * The larger of the two readings, field by field. Claude's `result` line is in a file the agent
 * can write to, so a last line of its own could understate what it spent: it never lowers what
 * Harbor counted. Both come from the agent's side of the sandbox in the end, so the provider's
 * spending cap on the key stays the bound that holds.
 */
function trialUsage(trialDir: string, result: TrialResultFile): HarborUsage | null {
  const readings = [claudeUsage(trialDir), harborUsage(result)].filter(
    (usage): usage is HarborUsage => usage !== null,
  )
  if (readings.length === 0) return null
  return {
    input: Math.max(...readings.map((usage) => usage.input)),
    cachedInput: Math.max(...readings.map((usage) => usage.cachedInput)),
    cacheWrite: Math.max(...readings.map((usage) => usage.cacheWrite)),
    output: Math.max(...readings.map((usage) => usage.output)),
  }
}

/** The task folder's metadata: through the path Harbor recorded, else by the task's name. */
function readMetadata(jobDir: string, result: TrialResultFile): TaskMetadata | null {
  const candidates = [
    result.task_id?.path,
    result.task_name ? join(jobDir, '..', '..', 'tasks', result.task_name) : undefined,
  ]
  for (const taskDir of candidates) {
    if (!taskDir) continue
    const file = join(taskDir, TASK_METADATA_FILE)
    if (!existsSync(file)) continue
    try {
      const parsed = metadataSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')))
      return parsed.success ? parsed.data : null
    } catch {
      return null
    }
  }
  if (!result.task_name) return null
  const at = result.task_name.lastIndexOf(TASK_NAME_SEPARATOR)
  const condition = result.task_name.slice(at + TASK_NAME_SEPARATOR.length)
  if (at <= 0 || !CONDITIONS.has(condition)) return null
  return { taskId: result.task_name.slice(0, at), condition: condition as Condition, base: '' }
}

class UnsafeWorkspace extends Error {}

/** Refuses a symbolic link (or anything but a folder or a file) anywhere under `root`. */
function assertPlainTree(root: string) {
  for (const name of readdirSync(root)) {
    const path = join(root, name)
    const stat = lstatSync(path)
    if (stat.isSymbolicLink()) throw new UnsafeWorkspace(`symbolic link ${name} in the workspace`)
    if (stat.isDirectory()) assertPlainTree(path)
    else if (!stat.isFile()) throw new UnsafeWorkspace(`special file ${name} in the workspace`)
  }
}

/** Gives a Git folder the fixed config and removes what Git would run or follow from it. */
function neutralizeGitDir(gitDir: string, config: string) {
  if (!lstatSync(gitDir).isDirectory()) throw new UnsafeWorkspace('a Git folder that is a file')
  for (const path of UNSAFE_GIT_PATHS) rmSync(join(gitDir, path), { recursive: true, force: true })
  writeFileSync(join(gitDir, 'config'), config)
}

/**
 * The trial's final workspace, made safe for Git to read, or why it was refused. The agent wrote
 * it: a `.git` file can send Git elsewhere, its config can name commands (`core.fsmonitor`, a
 * filter, `core.sshCommand`), a hook or an attribute can run one, and a symbolic link can make a
 * reader follow it out of the workspace.
 */
function finalState(
  trialDir: string,
  base: string,
): { state: FinalState | null; problem: string | null } {
  const work = trialWorkDir(trialDir)
  const root = join(work, 'repo')
  const remote = join(work, 'origin.git')
  if (!base || !existsSync(work)) return { state: null, problem: null }
  try {
    if (!lstatSync(work).isDirectory()) throw new UnsafeWorkspace('the workspace is not a folder')
    assertPlainTree(work)
    if (!existsSync(join(root, '.git'))) return { state: null, problem: null }
    neutralizeGitDir(join(root, '.git'), SAFE_GIT_CONFIG.repo)
    if (existsSync(remote)) neutralizeGitDir(remote, SAFE_GIT_CONFIG.bare)
  } catch (error) {
    if (error instanceof UnsafeWorkspace) return { state: null, problem: error.message }
    throw error
  }
  return { state: { root, base, remote }, problem: null }
}

const time = (value: string | null | undefined) => (value ? Date.parse(value) : Number.NaN)

type TrialFolder = { trialDir: string; result: TrialResultFile; metadata: TaskMetadata }

/** Every trial folder holding a readable `result.json` and metadata, in the order they started. */
function trialFolders(folder: string): TrialFolder[] {
  const jobDir = resolve(folder)
  if (!existsSync(jobDir)) return []
  const found: TrialFolder[] = []
  for (const name of readdirSync(jobDir).sort()) {
    const trialDir = join(jobDir, name)
    const resultFile = join(trialDir, 'result.json')
    if (!lstatSync(trialDir).isDirectory() || !existsSync(resultFile)) continue
    let result: TrialResultFile
    try {
      result = JSON.parse(readFileSync(resultFile, 'utf8')) as TrialResultFile
    } catch {
      continue
    }
    const metadata = readMetadata(jobDir, result)
    if (metadata !== null) found.push({ trialDir, result, metadata })
  }
  return found.sort((a, b) => (time(a.result.started_at) || 0) - (time(b.result.started_at) || 0))
}

/** Numbers the attempts of each (task, condition) 1 to k, in the order they started. */
function numbered<T extends { metadata: TaskMetadata }>(trials: T[]): (T & { attempt: number })[] {
  const attempts = new Map<string, number>()
  return trials.map((trial) => {
    const key = `${trial.metadata.taskId}${TASK_NAME_SEPARATOR}${trial.metadata.condition}`
    const attempt = (attempts.get(key) ?? 0) + 1
    attempts.set(key, attempt)
    return { ...trial, attempt }
  })
}

/**
 * Reads Harbor's job folder once `harbor run` exited or was killed: one result per trial folder
 * holding a `result.json`. A trial Harbor never finished writing is left out. Nothing is
 * filtered here: the caller filters every `outputs` text before it stores or logs anything.
 *
 * A final state is untrusted (the agent wrote it, and holds the key while it runs): it is graded
 * in a sandbox only, never run or read by Git in the worker. Before answering it, the reader
 * refuses any symbolic link or special file in it and a `.git` that is not a folder, writes a
 * fixed `.git/config` and removes hooks, `info/attributes` and alternates, so that nothing in it
 * is what Git or Node would run when it is read.
 */
export async function readHarborJob(folder: string): Promise<readonly HarborTrialResult[]> {
  return numbered(trialFolders(folder)).map(({ trialDir, result, metadata, attempt }) => {
    const startedAt = time(result.started_at)
    const finishedAt = time(result.finished_at)
    const { state, problem } = finalState(trialDir, metadata.base)
    const { outputs, cut } = trialOutputs(trialDir)
    return {
      taskId: metadata.taskId,
      condition: metadata.condition,
      attempt,
      state,
      stateProblem: problem,
      outputs,
      outputsCut: cut,
      usage: trialUsage(trialDir, result),
      error: result.exception_info?.exception_type ?? null,
      durationMs:
        Number.isFinite(startedAt) && Number.isFinite(finishedAt)
          ? Math.max(0, finishedAt - startedAt)
          : 0,
    }
  })
}

/** The usage of each trial so far, for polling a running job: no output, no state is read. */
export async function readHarborUsage(folder: string): Promise<readonly HarborTrialUsage[]> {
  return numbered(trialFolders(folder)).map(({ trialDir, result, metadata, attempt }) => ({
    taskId: metadata.taskId,
    condition: metadata.condition,
    attempt,
    usage: trialUsage(trialDir, result),
  }))
}
