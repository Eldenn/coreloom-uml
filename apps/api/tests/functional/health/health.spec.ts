import { test } from '@japa/runner'

test.group('Health', () => {
  test('reports ok when the database is reachable', async ({ client }) => {
    const response = await client.get('/health')

    response.assertStatus(200)
    response.assertBodyContains({ status: 'ok' })
  })
})
