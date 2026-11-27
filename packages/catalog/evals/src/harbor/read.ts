import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { Condition, type FinalState } from '../task.ts'
import { TASK_METADATA_FILE, TASK_NAME_SEPARATOR } from './constants.ts'
import { type TaskMetadata, trialWorkDir } from './export.ts'

export type HarborUsage = { input: number; cachedInput: number; cacheWrite: number; output: number }

export type HarborTrialResult = {
  taskId: string
  condition: Condition
  /** 1 to k, in the order the attempts of that (task, condition) started. */
  attempt: number
  /** The final workspace copied back from the sandbox, gradable as is; null when none came back. */
  state: FinalState | null
  /** Every text file Harbor wrote for that trial, by path under the trial's folder, unfiltered. */
  outputs: readonly { path: string; text: string }[]
  /**
   * Tokens: `input` not read from nor written to a cache, `cachedInput` read from it,
   * `cacheWrite` written to it, `output` generated. Null when the agent reported none.
   */
  usage: HarborUsage | null
  /** Harbor's exception class name only, never its message. */
  error: string | null
  durationMs: number
}

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

const CONDITIONS = new Set<string>(Object.values(Condition))

/** Whether `bytes` is text a filter can read: UTF-8, no NUL byte. */
function asText(bytes: Buffer): string | null {
  if (bytes.includes(0)) return null
  const text = bytes.toString('utf8')
  return Buffer.from(text, 'utf8').equals(bytes) ? text : null
}

/** Every regular text file under `root`, symbolic links not followed. */
function textFiles(root: string, folder: string = root): { path: string; text: string }[] {
  const found: { path: string; text: string }[] = []
  for (const name of readdirSync(folder).sort()) {
    const path = join(folder, name)
    const stat = lstatSync(path)
    if (stat.isDirectory()) found.push(...textFiles(root, path))
    else if (stat.isFile()) {
      const text = asText(readFileSync(path))
      if (text !== null) found.push({ path: relative(root, path), text })
    }
  }
  return found
}

const count = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0

/** The usage of Claude Code's last `result` event in its output, every model of the run summed. */
function claudeUsage(trialDir: string): HarborUsage | null {
  const file = join(trialDir, 'agent', 'claude-code.txt')
  if (!existsSync(file)) return null
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

/** The task folder's metadata: through the path Harbor recorded, else by the task's name. */
function readMetadata(jobDir: string, result: TrialResultFile): TaskMetadata | null {
  const candidates = [
    result.task_id?.path,
    result.task_name ? join(jobDir, '..', '..', 'tasks', result.task_name) : undefined,
  ]
  for (const taskDir of candidates) {
    if (!taskDir) continue
    const file = join(taskDir, TASK_METADATA_FILE)
    if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as TaskMetadata
  }
  if (!result.task_name) return null
  const at = result.task_name.lastIndexOf(TASK_NAME_SEPARATOR)
  const condition = result.task_name.slice(at + TASK_NAME_SEPARATOR.length)
  if (at <= 0 || !CONDITIONS.has(condition)) return null
  return { taskId: result.task_name.slice(0, at), condition: condition as Condition, base: '' }
}

function finalState(trialDir: string, base: string): FinalState | null {
  const work = trialWorkDir(trialDir)
  const root = join(work, 'repo')
  if (!base || !existsSync(join(root, '.git'))) return null
  return { root, base, remote: join(work, 'origin.git') }
}

const time = (value: string | null | undefined) => (value ? Date.parse(value) : Number.NaN)

/**
 * Reads Harbor's job folder once `harbor run` exited or was killed: one result per trial folder
 * holding a `result.json`. A trial Harbor never finished writing is left out. Nothing is
 * filtered here: the caller filters every `outputs` text before it stores or logs anything.
 */
export async function readHarborJob(folder: string): Promise<readonly HarborTrialResult[]> {
  // The final states are read by Git from other working directories: their paths are absolute.
  const jobDir = resolve(folder)
  if (!existsSync(jobDir)) return []
  const read: (HarborTrialResult & { startedAt: number })[] = []
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
    if (metadata === null) continue
    const startedAt = time(result.started_at)
    const finishedAt = time(result.finished_at)
    read.push({
      taskId: metadata.taskId,
      condition: metadata.condition,
      attempt: 0,
      state: finalState(trialDir, metadata.base),
      outputs: textFiles(trialDir),
      usage: claudeUsage(trialDir) ?? harborUsage(result),
      error: result.exception_info?.exception_type ?? null,
      durationMs:
        Number.isFinite(startedAt) && Number.isFinite(finishedAt)
          ? Math.max(0, finishedAt - startedAt)
          : 0,
      startedAt,
    })
  }
  const attempts = new Map<string, number>()
  return read
    .sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0))
    .map(({ startedAt: _, ...trial }) => {
      const key = `${trial.taskId}${TASK_NAME_SEPARATOR}${trial.condition}`
      const attempt = (attempts.get(key) ?? 0) + 1
      attempts.set(key, attempt)
      return { ...trial, attempt }
    })
}
