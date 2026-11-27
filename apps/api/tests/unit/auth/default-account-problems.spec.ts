import { test } from '@japa/runner'
import { defaultAccountProblems } from '#app/auth/services/default-account'

const EMAIL = 'admin@example.com'
const PASSPHRASE = 'a-very-strong-passphrase'
const missing = (name: string) => `Missing environment variable "${name}" (required in production)`

test.group('defaultAccountProblems', () => {
  test('production needs the email and the password', ({ assert }) => {
    assert.deepEqual(defaultAccountProblems('production', {}), [
      missing('DEFAULT_ACCOUNT_EMAIL'),
      missing('DEFAULT_ACCOUNT_PASSWORD'),
    ])
    assert.deepEqual(defaultAccountProblems('production', { DEFAULT_ACCOUNT_EMAIL: EMAIL }), [
      missing('DEFAULT_ACCOUNT_PASSWORD'),
    ])
    assert.deepEqual(
      defaultAccountProblems('production', {
        DEFAULT_ACCOUNT_EMAIL: '',
        DEFAULT_ACCOUNT_PASSWORD: PASSPHRASE,
      }),
      [missing('DEFAULT_ACCOUNT_EMAIL')],
    )
    assert.deepEqual(
      defaultAccountProblems('production', {
        DEFAULT_ACCOUNT_EMAIL: EMAIL,
        DEFAULT_ACCOUNT_PASSWORD: PASSPHRASE,
      }),
      [],
    )
  })

  test('development and test run without a default account', ({ assert }) => {
    assert.deepEqual(defaultAccountProblems('development', {}), [])
    assert.deepEqual(defaultAccountProblems('test', {}), [])
  })
})
