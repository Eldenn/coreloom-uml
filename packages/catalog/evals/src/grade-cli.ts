/**
 * Grades one trial where it ran: `node grade-cli.ts <task id> <root> <base> <remote>` prints the
 * two grades as one JSON line (`TrialGrades`), or exits 2 on arguments it cannot read. Run by Node
 * from TypeScript source (type stripping) inside the trial's sandbox, so the agent's repository
 * and code are read and run there, never on a server of ours.
 */
import { findEvalTask, gradeTrial } from './grade.ts'

const [taskId = '', root = '', base = '', remote = ''] = process.argv.slice(2)
const task = findEvalTask(taskId)
if (!task || !root || !/^[0-9a-f]{40}$/.test(base) || !remote) {
  process.stderr.write('usage: grade-cli.ts <task id> <root> <base commit> <remote>\n')
  process.exit(2)
}
process.stdout.write(`${JSON.stringify(gradeTrial(task, { root, base, remote }))}\n`)
