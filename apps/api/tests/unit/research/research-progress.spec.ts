import { test } from '@japa/runner'
import { readProgress, trackProgress } from '#app/research/services/research-progress'

test.group('Research progress', () => {
  test('a tool call that settles after clear() writes nothing back', async ({ assert }) => {
    // An id no account has: the key is this test's alone.
    const userId = 900_000_000 + Math.floor(Math.random() * 1_000_000)
    let settle: (results: []) => void = () => {}
    const tracked = trackProgress(userId, {
      readPage: async () => null,
      run: async () => ({ exitCode: 0, output: '' }),
      search: () => new Promise((resolve) => (settle = resolve)),
    })

    const searching = tracked.tools.search?.('zephyr pnpm')
    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.lengthOf(await readProgress(userId), 1)

    // The research ran out of time: its `finally` clears the key while the search still runs.
    await tracked.clear()
    settle([])
    await searching
    assert.deepEqual(await readProgress(userId), [])
  })
})
