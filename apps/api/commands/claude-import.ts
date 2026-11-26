import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

export default class ClaudeImport extends BaseCommand {
  static commandName = 'claude:import'
  static description =
    'Move the Claude subscriptions still held in account folders into the database'

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    const { importClaudeFolders } = await import('#app/llm-connections/services/claude-code-state')
    const { imported, removed } = await importClaudeFolders()
    this.logger.success(
      `claude subscriptions: ${imported} moved to the database, ${removed} folder(s) removed`,
    )
  }
}
