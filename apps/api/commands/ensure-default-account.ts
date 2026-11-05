import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

export default class EnsureDefaultAccount extends BaseCommand {
  static commandName = 'account:ensure-default'
  static description =
    'Create the default account from DEFAULT_ACCOUNT_* or bring it back in line with them'

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    const { defaultAccountConfig, ensureDefaultAccount } = await import(
      '#app/auth/services/default-account'
    )

    const config = defaultAccountConfig()
    if (!config) {
      this.logger.warning(
        'DEFAULT_ACCOUNT_EMAIL / DEFAULT_ACCOUNT_PASSWORD are not set: no default account',
      )
      return
    }

    try {
      const result = await ensureDefaultAccount(config)
      this.logger.success(`Default account ${config.email}: ${result}`)
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error))
      this.exitCode = 1
    }
  }
}
