import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'
import queue from '@nemoventures/adonis-jobs/services/main'
import User from '#app/users/models/user'

/**
 * Integration seam: `mail.sendLater(...)` must land on the BullMQ queue as a
 * `SendMailJob` (wired in `start/mail.ts`). Needs a running Redis — the CI
 * workflow starts one; locally, `docker compose -f infra/docker-compose.yml up`.
 *
 * No `mail.fake()` here on purpose: faking bypasses the messenger, which is
 * exactly the code path under test.
 */
test.group('Mail queue', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())
  group.each.setup(async () => {
    await queue.useQueue('default').drain(true)
    return async () => {
      await queue.useQueue('default').drain(true)
    }
  })

  test('forgot-password enqueues a SendMailJob', async ({ client, assert }) => {
    await User.create({ email: 'queued@example.com', password: 'a-very-strong-passphrase' })

    const response = await client
      .post('/auth/forgot-password')
      .header('accept', 'application/json')
      .json({ email: 'queued@example.com' })

    response.assertStatus(200)

    const jobs = await queue.useQueue('default').getJobs(['waiting', 'delayed'])
    assert.isTrue(jobs.some((job) => job.name === 'SendMailJob'))
  })
})
