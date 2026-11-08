import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'
import { ArchitectureVisibility } from '#app/architectures/constants/visibility'
import Architecture from '#app/architectures/models/architecture'
import { defaultProjectFor } from '#app/projects/services/owned-project'
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

    const count = await Architecture.query().where('userId', user.id).count('* as total')
    if (Number(count[0].$extras.total) > 0) return

    // Empty diagrams open on the editor's template for their kind.
    const project = await defaultProjectFor(user)
    const architecture = await Architecture.create({
      userId: user.id,
      projectId: project.id,
      title: 'Sample architecture',
      description: 'Seeded for the demo. Log in as demo@coreloom-uml.dev to see it.',
      visibility: ArchitectureVisibility.Private,
    })
    await architecture.related('diagrams').createMany([
      { title: 'Context', kind: 'c4', content: null, position: 0 },
      { title: 'Deployment', kind: 'deployment', content: null, position: 1 },
      { title: 'Domain model', kind: 'class', content: null, position: 2 },
    ])
  }
}
