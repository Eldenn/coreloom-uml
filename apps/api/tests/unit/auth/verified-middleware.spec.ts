import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import VerifiedMiddleware from '#app/auth/middleware/verified-middleware'

function fakeContext(emailVerifiedAt: DateTime | null) {
  const state: { forbidden: unknown; nextCalled: boolean } = {
    forbidden: undefined,
    nextCalled: false,
  }

  const ctx = {
    auth: { getUserOrFail: () => ({ emailVerifiedAt }) },
    response: {
      forbidden(body: unknown) {
        state.forbidden = body
        return body
      },
    },
  } as unknown as HttpContext

  const next = (async () => {
    state.nextCalled = true
  }) as NextFn

  return { ctx, next, state }
}

test.group('VerifiedMiddleware', () => {
  test('passes through when the email is verified', async ({ assert }) => {
    const { ctx, next, state } = fakeContext(DateTime.now())

    await new VerifiedMiddleware().handle(ctx, next)

    assert.isTrue(state.nextCalled)
    assert.isUndefined(state.forbidden)
  })

  test('responds 403 E_EMAIL_NOT_VERIFIED when the email is not verified', async ({ assert }) => {
    const { ctx, next, state } = fakeContext(null)

    await new VerifiedMiddleware().handle(ctx, next)

    assert.isFalse(state.nextCalled)
    assert.deepEqual(state.forbidden, {
      error: {
        message: 'Verify your email address to access this resource.',
        code: 'E_EMAIL_NOT_VERIFIED',
      },
    })
  })
})
