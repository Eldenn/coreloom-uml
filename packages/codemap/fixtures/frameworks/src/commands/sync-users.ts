import { BaseCommand } from '@adonisjs/core/ace'
import { UsersService } from '../users/users.service'
export default class SyncUsers extends BaseCommand {
  static commandName = 'users:sync'
  async run() { new UsersService().findAll() }
}
