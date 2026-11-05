import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'
import Note from '#app/notes/models/note'
import User from '#app/users/models/user'

export default class MainSeeder extends BaseSeeder {
  static environment = ['development', 'test']

  async run() {
    const user = await User.firstOrCreate(
      { email: 'demo@coreloom-uml.dev' },
      {
        fullName: 'Demo User',
        email: 'demo@coreloom-uml.dev',
        password: 'Demo-Password-2026!',
        emailVerifiedAt: DateTime.now(),
      },
    )

    const noteCount = await Note.query().where('userId', user.id).count('* as total')
    if (Number(noteCount[0].$extras.total) > 0) return

    await Note.createMany([
      {
        userId: user.id,
        title: 'Welcome to Coreloom UML',
        body: 'This note was seeded for the demo.',
      },
      { userId: user.id, title: 'Second note', body: 'Notes support create, edit and delete.' },
      { userId: user.id, title: 'Third note', body: 'Log in as demo@coreloom-uml.dev to see these.' },
    ])
  }
}
