import { args, BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

export default class SkillsBlock extends BaseCommand {
  static commandName = 'skills:block'
  static description = 'Stop suggesting a catalog skill (or suggest it again with --unblock)'

  static options: CommandOptions = {
    startApp: true,
  }

  @args.string({ description: 'The skill’s slug, as the catalog lists it' })
  declare slug: string

  @flags.string({ description: 'Why it is blocked' })
  declare reason?: string

  @flags.boolean({ description: 'Suggest it again' })
  declare unblock?: boolean

  async run() {
    const { setSkillBlocked } = await import('#app/skills/services/skills-catalog')
    const found = await setSkillBlocked(this.slug, !this.unblock, this.reason)
    if (!found) {
      this.logger.error(`No skill "${this.slug}" in the catalog`)
      this.exitCode = 1
      return
    }
    this.logger.success(`${this.slug} ${this.unblock ? 'unblocked' : 'blocked'}`)
  }
}
