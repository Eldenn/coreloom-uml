import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'
import queue from '@nemoventures/adonis-jobs/services/main'
import ClassifySkillTopicsJob from '#app/jobs/classify-skill-topics_job'
import SendMailJob from '#app/jobs/send-mail_job'
import type { QueueJobsOutput } from '#app/queue-jobs/validators/queue-jobs-output'
import { SKILL_TOPICS_QUEUE } from '#app/skills/constants/skill-topics'
import User from '#app/users/models/user'
import env from '#start/env'

const json = { accept: 'application/json' }
const ADMIN = 'queue-jobs-admin@example.com'
const PASSWORD = 'a-very-strong-passphrase'
const SCHEDULER = 'admin-queue-jobs-spec'

test.group('Admin queue jobs', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())
  group.each.setup(async () => {
    env.set('DEFAULT_ACCOUNT_EMAIL', ADMIN)
    env.set('DEFAULT_ACCOUNT_PASSWORD', 'the-default-passphrase')
    await queue.useQueue(SKILL_TOPICS_QUEUE).drain(true)
    await queue.useQueue('default').drain(true)
    return async () => {
      env.set('DEFAULT_ACCOUNT_EMAIL', '')
      env.set('DEFAULT_ACCOUNT_PASSWORD', '')
      await queue.useQueue(SKILL_TOPICS_QUEUE).removeJobScheduler(SCHEDULER)
      await queue.useQueue(SKILL_TOPICS_QUEUE).drain(true)
      await queue.useQueue('default').drain(true)
    }
  })

  test('lists the queued jobs by name and state, never their data or the mail', async ({
    assert,
    client,
  }) => {
    const admin = await User.create({ email: ADMIN, password: PASSWORD })
    const other = await User.create({ email: 'queue-jobs-other@example.com', password: PASSWORD })
    // Delayed, so a worker of the development stack sharing this Redis never takes it.
    const added = await queue
      .useQueue(SKILL_TOPICS_QUEUE)
      .add(ClassifySkillTopicsJob.jobName, {}, { delay: 60_000 })
    await queue
      .useQueue('default')
      .add(SendMailJob.jobName, { to: 'someone@example.com' }, { delay: 60_000 })

    // A scheduled run not due yet: nobody launched it, so it is not listed.
    const scheduled = await queue
      .useQueue(SKILL_TOPICS_QUEUE)
      .upsertJobScheduler(
        SCHEDULER,
        { pattern: '0 0 1 1 *' },
        { name: ClassifySkillTopicsJob.jobName, data: {} },
      )

    const ask = (user: User) => client.get('/admin/jobs').headers(json).loginAs(user)
    ;(await ask(other)).assertStatus(404)

    const response = await ask(admin)
    response.assertStatus(200)
    // A development stack sharing this Redis may have jobs of its own: read the one added here.
    const { jobs }: QueueJobsOutput = response.body()
    const job = jobs.find((listed) => listed.id === `${SKILL_TOPICS_QUEUE}:${added.id}`)
    assert.containsSubset(job, {
      queue: SKILL_TOPICS_QUEUE,
      name: ClassifySkillTopicsJob.jobName,
      status: 'queued',
      startedAt: null,
    })
    assert.notProperty(job, 'data')
    assert.notInclude(
      jobs.map((listed) => listed.id),
      `${SKILL_TOPICS_QUEUE}:${scheduled.id}`,
    )
    assert.notInclude(
      jobs.map((listed) => listed.name),
      SendMailJob.jobName,
    )
  })
})
