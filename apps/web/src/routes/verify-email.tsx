import { createFileRoute } from '@tanstack/react-router'
import { VerifyEmailPage } from '../pages/verify-email-page'

type VerifyEmailSearch = { token?: string }

export const Route = createFileRoute('/verify-email')({
  validateSearch: (search: Record<string, unknown>): VerifyEmailSearch => ({
    token: typeof search.token === 'string' ? search.token : undefined,
  }),
  component: VerifyEmailPage,
})
