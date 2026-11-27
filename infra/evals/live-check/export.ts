// Exports the convention evals as Harbor tasks and prints the command as JSON, for
// `infra/evals/live-check/run.sh` (a manual check against an E2B install, never CI).
// Usage: node export.ts <run folder> <claude-code|codex> <oracle: 0|1> <attempts> [<task--condition>]
import { mkdirSync } from 'node:fs'
import { prepareHarborRun } from '../../../packages/catalog/evals/src/harbor/index.ts'
import { Condition } from '../../../packages/catalog/evals/src/task.ts'
import { conventionFiles } from '../../../packages/catalog/evals/src/workspace.ts'
import { EVAL_TASKS } from '../../../packages/catalog/evals/tasks/index.ts'

const [dir, agent, oracle, attempts, only] = process.argv.slice(2)
if (!dir || (agent !== 'claude-code' && agent !== 'codex')) {
  throw new Error('usage: node export.ts <dir> <claude-code|codex> <0|1> <attempts> [<task--condition>]')
}
mkdirSync(dir, { recursive: true, mode: 0o700 })
const trials = EVAL_TASKS.flatMap((task) =>
  [Condition.None, Condition.Full].map((condition) => ({
    task,
    condition,
    files: Object.fromEntries(conventionFiles(task, condition).map((file) => [file.path, file.content])),
  })),
).filter((trial) => !only || `${trial.task.id}--${trial.condition}` === only)
const command = await prepareHarborRun({
  dir,
  agent,
  model: agent === 'codex' ? 'gpt-5-codex' : 'claude-sonnet-5-5',
  providerHost: agent === 'codex' ? 'api.openai.com' : 'api.anthropic.com',
  trials,
  attempts: Number(attempts),
  concurrency: 3,
  runId: `live-${Date.now()}`,
  accountId: 1,
  oracle: oracle === '1',
})
console.log(JSON.stringify(command))
