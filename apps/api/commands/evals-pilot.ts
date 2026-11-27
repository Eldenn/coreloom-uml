import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { PROVIDER_KINDS, type ProviderKind } from '@coreloom-uml/catalog'

/**
 * Dev-only: the admin's pilot of the convention tests, through the code the routes and the job
 * use. `--enable-flag` turns `convention-evals` on for the admin alone, `--prepare` creates (or
 * reuses) the admin's "Convention tests pilot" configuration, `--run --config <id> --kind <kind>`
 * plans the test (path II only: path I waits for #153), starts it as the route does and runs the
 * job in this process (`--dry` stops after the plan). Refuses to run in production.
 */
export default class EvalsPilot extends BaseCommand {
  static commandName = 'evals:pilot'
  static description = "Dev only: the admin's pilot of the convention tests (flag, config, run)"

  static options: CommandOptions = { startApp: true }

  @flags.boolean({ description: 'Turn convention-evals on for the admin alone' })
  declare enableFlag: boolean

  @flags.boolean({
    flagName: 'prepare',
    description: 'Create or reuse the pilot configuration and print its id',
  })
  declare prepareConfig: boolean

  @flags.boolean({ flagName: 'run', description: 'Plan, start and run one convention test here' })
  declare startRun: boolean

  @flags.number({ description: 'The configuration to test' })
  declare config: number | undefined

  @flags.string({ description: 'The provider kind (path II only)', default: 'claude-code' })
  declare kind: string

  @flags.string({ description: "The model; the catalog's default for the kind when omitted" })
  declare model: string | undefined

  @flags.boolean({ description: 'With --run: stop after printing the plan' })
  declare dry: boolean

  async run() {
    if (this.app.inProduction) {
      this.logger.error('evals:pilot is a development command')
      this.exitCode = 1
      return
    }
    const pilot = await import('#app/convention-evals/services/eval-pilot')
    const print = (line: string) => this.logger.info(line)
    try {
      if (this.enableFlag) await pilot.enablePilotFlag(print)
      if (this.prepareConfig) print(`config id: ${String(await pilot.preparePilotConfig(print))}`)
      if (this.startRun) {
        if (this.config === undefined) throw new pilot.PilotRefusal('--run needs --config <id>')
        if (!PROVIDER_KINDS.includes(this.kind as ProviderKind)) {
          throw new pilot.PilotRefusal(`unknown kind ${this.kind}`)
        }
        const kind = this.kind as ProviderKind
        const model = this.model ?? pilot.defaultModelOf(kind)
        if (!model) throw new pilot.PilotRefusal(`no default model for ${kind}: pass --model`)
        print(`model: ${model}${this.model ? '' : ` (the catalog's default for ${kind})`}`)
        await pilot.runPilot({ configId: this.config, kind, model, dry: this.dry }, print)
      }
    } catch (error) {
      if (!(error instanceof pilot.PilotRefusal)) throw error
      this.logger.error(error.message)
      this.exitCode = 1
    }
  }
}
