import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import { test } from '@japa/runner'
import Architecture from '#app/architectures/models/architecture'
import Decision from '#app/decisions/models/decision'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import Project from '#app/projects/models/project'
import Requirement from '#app/requirements/models/requirement'
import User from '#app/users/models/user'
import { withDefaultFlags } from '#tests/helpers/feature-flags'

const json = { accept: 'application/json' }
const ON = { enabled: true, rollout: 100, rules: [] }

async function setup(email: string, enabled = true) {
  const user = await User.create({ email, password: 'a-very-strong-passphrase' })
  if (enabled) await updateFlag(FeatureFlagKey.DesignRecords, ON, user)
  const project = await Project.create({ userId: user.id, name: 'Shop', description: null })
  return { user, project }
}

type Fixture = Awaited<ReturnType<typeof setup>>

const requirement = ({ user, project }: Fixture, priority: 'must' | 'should', statement: string) =>
  Requirement.create({
    projectId: project.id,
    userId: user.id,
    category: 'availability',
    priority,
    statement,
    measure: null,
  })

const decision = ({ user, project }: Fixture, title: string, status: Decision['status']) =>
  Decision.create({
    projectId: project.id,
    userId: user.id,
    title,
    context: null,
    options: [{ name: 'Queue', pros: null, cons: null }],
    chosen: 'Queue',
    consequences: null,
    status,
    supersededById: null,
  })

test.group('Design review', (group) => {
  group.each.setup(() => withDefaultFlags())

  test("answers 404 while the flag is off, and for another account's project", async ({
    client,
  }) => {
    const read = (f: Fixture, user: User) =>
      client.get(`/projects/${f.project.id}/design-review`).headers(json).loginAs(user)
    // The flag is one state for the instance: read before another setup turns it on.
    const off = await setup('design-review-off@example.com', false)
    ;(await read(off, off.user)).assertStatus(404)

    const mine = await setup('design-review-mine@example.com')
    const other = await setup('design-review-other@example.com')
    ;(await read(other, mine.user)).assertStatus(404)
    ;(await read(mine, mine.user)).assertStatus(200)
  })

  test('finds what the records say against themselves, and nothing else', async ({
    client,
    assert,
  }) => {
    const f = await setup('design-review-findings@example.com')
    const architecture = await Architecture.create({
      userId: f.user.id,
      projectId: f.project.id,
      title: 'Zephyr',
      visibility: 'private',
    })
    const diagram = await architecture
      .related('diagrams')
      .create({ title: 'Main', kind: 'class', position: 0 })

    const served = await requirement(f, 'must', 'Checkout stays up when mail is down.')
    const unserved = await requirement(f, 'must', 'Card numbers never reach our servers.')
    // Served by a decision that is still open only: not served yet.
    const open = await requirement(f, 'must', 'The catalogue answers fast.')
    await requirement(f, 'should', 'Hosting stays cheap.')

    const sound = await decision(f, 'How are mails sent?', 'accepted')
    await sound.related('requirements').attach([served.id])
    await sound.related('diagrams').attach([diagram.id])
    const floating = await decision(f, 'Where do sessions live?', 'accepted')
    const pending = await decision(f, 'Which cache?', 'proposed')
    await pending.related('requirements').attach([open.id])
    const old = await decision(f, 'Mails in the request', 'superseded')
    await old.related('diagrams').attach([diagram.id])
    await decision(f, 'Sessions in a cookie', 'superseded')

    const response = await client
      .get(`/projects/${f.project.id}/design-review`)
      .headers(json)
      .loginAs(f.user)

    response.assertStatus(200)
    assert.deepEqual(response.body().findings, [
      {
        kind: 'unserved_requirement',
        requirementId: unserved.id,
        decisionId: null,
        subject: 'Card numbers never reach our servers.',
      },
      {
        kind: 'unserved_requirement',
        requirementId: open.id,
        decisionId: null,
        subject: 'The catalogue answers fast.',
      },
      {
        kind: 'decision_without_diagram',
        requirementId: null,
        decisionId: floating.id,
        subject: 'Where do sessions live?',
      },
      {
        kind: 'superseded_still_linked',
        requirementId: null,
        decisionId: old.id,
        subject: 'Mails in the request',
      },
    ])
  })
})
