import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

/**
 * Dev-only: runs path II of the convention tests on the configured E2B install with a scripted
 * model (no provider is ever called) and prints what happened, counts and verdicts only. For the
 * pilot's checks: the template is there and has room, each task's scripted solution is graded
 * `pass` in its sandbox, the sandbox reaches no network, and the sweep removes a sandbox whose
 * process died. Every sandbox it opens is killed in a `finally`. Refuses to run in production.
 */
export default class EvalsSmoke extends BaseCommand {
  static commandName = 'evals:smoke'
  static description =
    'Dev only: run the convention tests harness on E2B with a scripted model (no provider call)'

  static options: CommandOptions = { startApp: true }

  @flags.string({ description: 'Only this task id' })
  declare task: string | undefined

  @flags.boolean({ description: 'Check the sandbox reaches no network' })
  declare egress: boolean

  @flags.boolean({ description: 'Open one trial sandbox and hang in it until killed' })
  declare hang: boolean

  @flags.number({ description: 'Sweep the convention test sandboxes older than this (ms)' })
  declare sweepAge: number | undefined

  async run() {
    if (this.app.inProduction) {
      this.logger.error('evals:smoke is a development command')
      this.exitCode = 1
      return
    }
    const smoke = await import('#app/convention-evals/services/eval-smoke')
    if (this.sweepAge !== undefined) {
      const report = await smoke.sweepNow(this.sweepAge)
      this.logger.info(JSON.stringify(report))
      return
    }
    const dir = await mkdtemp(join(this.app.makePath('tmp'), 'evals-smoke-'))
    try {
      if (this.hang) {
        await smoke.hangInTrial(dir, (line) => this.logger.info(line))
        return
      }
      const template = await smoke.ensureEvalTemplate((line) => this.logger.info(line))
      this.logger.info(`template ${template}`)
      if (this.egress) {
        this.logger.info(JSON.stringify(await smoke.checkEgress(dir)))
        return
      }
      for (const result of await smoke.runScriptedTrials(dir, this.task)) {
        this.logger.info(JSON.stringify(result))
      }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }
}
