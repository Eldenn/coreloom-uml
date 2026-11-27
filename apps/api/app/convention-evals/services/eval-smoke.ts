import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import app from '@adonisjs/core/services/app'
import {
  Condition,
  conventionFiles,
  createWorkspace,
  EVAL_TASKS,
  type EvalTask,
  workspaceFiles,
} from '@coreloom-uml/catalog/evals'
import { runCodingTrial } from '@coreloom-uml/llm'
import { MockLanguageModelV4 } from '@coreloom-uml/llm/testing'
import { EVAL_SANDBOX_METADATA } from '#app/convention-evals/constants/convention-evals'
import { BASE_ENVS, SHELL } from '#app/convention-evals/services/eval-commands'
import EvalSandboxes from '#app/convention-evals/services/eval-sandbox'
import { buildGraderArchive } from '#app/convention-evals/services/grader-bundle'
import {
  gradeInSandbox,
  openTrialSandbox,
  packWorkspace,
} from '#app/convention-evals/services/trial-sandbox'
import { sweepEvalSandboxes } from '#app/jobs/prune-convention-eval-sandboxes_job'

/*
 * Dev-only checks of path II on a real E2B install (`node ace evals:smoke`). The model is a
 * script: a mock language model whose calls are the given shell commands, then a final answer.
 * No provider is ever called. Not used by the app.
 */

const FIX_SUM = "sed -i 's/let index = 1/let index = 0/' src/sum.js"
const commitWith = (subject: string) => `git add src/sum.js && git commit -q -m '${subject}'`
const SLUG_FILE = [
  "cat > src/slug.js <<'EOF'",
  "import slugify from 'slugify'",
  '',
  '/** The URL slug of a title. */',
  'export function slug(title) {',
  '  return slugify(title, { lower: true, strict: true })',
  '}',
  'EOF',
].join('\n')

/** Each task's reference solution, as the shell commands an agent would run. */
export const SCRIPTED_SOLUTIONS: Readonly<Record<string, readonly string[]>> = {
  'package-manager-pnpm-add': ['pnpm add slugify@1.6.6 2>&1 | tail -n 5', SLUG_FILE],
  'package-manager-pnpm-idle': [FIX_SUM],
  'commit-messages-conventional': [FIX_SUM, commitWith('fix(sum): count the first value')],
  'commit-messages-imperative': [FIX_SUM, commitWith('Count the first value in sum')],
}

/** A model that runs these commands one step each, then answers. */
export function scriptedModel(commands: readonly string[]) {
  const usage = {
    inputTokens: { total: 100, noCache: 100, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 10, text: 10, reasoning: undefined },
  }
  return new MockLanguageModelV4({
    doGenerate: async (options) => {
      const step = options.prompt.filter((message) => message.role === 'tool').length
      const command = commands[step]
      if (command === undefined) {
        return {
          content: [{ type: 'text', text: 'Done.' }],
          finishReason: { unified: 'stop', raw: 'stop' },
          usage,
          warnings: [],
        }
      }
      return {
        content: [
          {
            type: 'tool-call',
            toolCallId: `call-${String(step)}`,
            toolName: 'run',
            input: JSON.stringify({ command }),
          },
        ],
        finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
        usage,
        warnings: [],
      }
    },
  })
}

export async function ensureEvalTemplate(onLog?: (line: string) => void) {
  return (await app.container.make(EvalSandboxes)).ensureTemplate(onLog)
}

const SMOKE_META = { runId: 0, accountId: 0 }

/** A trial sandbox holding this task's workspace in this condition; null when E2B failed. */
async function openFor(dir: string, task: EvalTask, condition: Condition) {
  const folder = join(dir, `${task.id}-${condition}-${String(Date.now())}`)
  await mkdir(folder, { recursive: true })
  const conventions =
    condition === Condition.Full ? workspaceFiles(conventionFiles(task, Condition.Full)) : {}
  const state = createWorkspace(task, condition, folder, conventions)
  const opened = await openTrialSandbox(
    SMOKE_META,
    await packWorkspace(state, join(folder, 'stage')),
  )
  return opened ? { opened, state, conventions } : null
}

/** Runs each task's scripted solution in `none` and `full`, grading each in its sandbox. */
export async function runScriptedTrials(dir: string, only?: string) {
  const graderArchive = await buildGraderArchive(dir)
  const results: unknown[] = []
  for (const task of EVAL_TASKS.filter((item) => !only || item.id === only)) {
    for (const condition of [Condition.None, Condition.Full]) {
      const started = performance.now()
      const open = await openFor(dir, task, condition)
      if (!open) {
        results.push({ task: task.id, condition, error: 'sandbox_unavailable' })
        continue
      }
      try {
        const opened = performance.now()
        const disk = await open.opened.sandbox.run(SHELL, {
          ...BASE_ENVS,
          SHELL_COMMAND: "df -m / | awk 'NR==2 {print $4}'",
        })
        const trial = await runCodingTrial(scriptedModel(SCRIPTED_SOLUTIONS[task.id] ?? []), {
          instruction: task.instruction,
          agentsMd: open.conventions['AGENTS.md'] ?? null,
          run: (command) =>
            open.opened.sandbox.run(SHELL, { ...BASE_ENVS, SHELL_COMMAND: command }),
        })
        const ran = performance.now()
        const grades = await gradeInSandbox(open.opened.sandbox, {
          taskId: task.id,
          base: open.state.base,
          graderArchive,
        })
        results.push({
          task: task.id,
          condition,
          sandboxId: open.opened.sandbox.sandboxId,
          freeDiskMb: Number(disk.output.trim()),
          commands: trial.commands,
          failure: trial.failure,
          success: grades?.success ?? null,
          compliance: grades?.compliance ?? null,
          ms: {
            open: Math.round(opened - started),
            agent: Math.round(ran - opened),
            grade: Math.round(performance.now() - ran),
          },
          // The scripted commands' output, for a failing run to be read: no secret is in it.
          transcript: grades?.success.verdict === 'pass' ? undefined : trial.transcript,
        })
      } finally {
        await open.opened.close()
      }
    }
  }
  return results
}

/** What the sandbox reaches: a provider by name and a name lookup, both expected to fail. */
export async function checkEgress(dir: string) {
  const task = EVAL_TASKS[0] as EvalTask
  const open = await openFor(dir, task, Condition.None)
  if (!open) return { error: 'sandbox_unavailable' }
  try {
    const probe = async (command: string) => {
      const ran = await open.opened.sandbox.run(SHELL, { ...BASE_ENVS, SHELL_COMMAND: command })
      return { command, exitCode: ran.exitCode, output: ran.output.trim().slice(0, 300) }
    }
    return {
      sandboxId: open.opened.sandbox.sandboxId,
      probes: [
        await probe('curl -sS -m 10 -o /dev/null -w "%{http_code}" https://api.anthropic.com'),
        await probe('getent hosts example.com'),
        await probe('curl -sS -m 10 -o /dev/null -w "%{http_code}" http://1.1.1.1'),
        await probe('sudo -n true'),
      ],
    }
  } finally {
    await open.opened.close()
  }
}

/** Opens a trial sandbox and waits in it until this process is killed. */
export async function hangInTrial(dir: string, say: (line: string) => void) {
  const task = EVAL_TASKS[0] as EvalTask
  const open = await openFor(dir, task, Condition.None)
  if (!open) throw new Error('sandbox_unavailable')
  say(`hanging in ${open.opened.sandbox.sandboxId}`)
  try {
    await open.opened.sandbox.run(SHELL, { ...BASE_ENVS, SHELL_COMMAND: 'sleep 110' })
    await new Promise(() => {})
  } finally {
    await open.opened.close()
  }
}

/** The sandboxes of the convention tests before and after a sweep at `maxAgeMs`. */
export async function sweepNow(maxAgeMs: number) {
  const sandboxes = await app.container.make(EvalSandboxes)
  const query = { [EVAL_SANDBOX_METADATA.purposeKey]: EVAL_SANDBOX_METADATA.purpose }
  const before = (await sandboxes.list(query)).map((item) => item.sandboxId)
  const killed = await sweepEvalSandboxes(maxAgeMs)
  const after = (await sandboxes.list(query)).map((item) => item.sandboxId)
  return { before, killed, after }
}
