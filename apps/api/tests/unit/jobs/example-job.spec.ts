import type { Logger } from '@adonisjs/core/logger'
import { test } from '@japa/runner'
import ExampleJob, { type ExampleJobData } from '#app/jobs/example_job'

function fakeJob(data: ExampleJobData) {
  const logged: Array<{ merge: object; message: string }> = []
  const job = new ExampleJob()
  job.data = data
  job.logger = {
    info: (merge: object, message: string) => logged.push({ merge, message }),
  } as unknown as Logger
  return { job, logged }
}

test.group('ExampleJob', () => {
  test('process() logs the payload label', async ({ assert }) => {
    const { job, logged } = fakeJob({ label: 'ping' })

    await job.process()

    assert.deepEqual(logged, [{ merge: { label: 'ping' }, message: 'ExampleJob processed' }])
  })
})
