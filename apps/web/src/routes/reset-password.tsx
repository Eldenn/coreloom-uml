import { PASSWORD_POLICY } from '@coreloom-uml/auth-policy'
import { useMutation } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import * as React from 'react'
import { z } from 'zod'

import { AuthLayout } from '@/components/auth-layout'
import { Brand } from '@/components/brand'
import { ResetPasswordForm } from '@/components/password-reset-form'
import { toast } from '@/components/ui/sonner'
import { client } from '@/lib/client'
import { useT } from '@/lib/locale'

// The page the reset email links to: /reset-password?token=…
export const Route = createFileRoute('/reset-password')({
  validateSearch: z.object({ token: z.string().catch('') }),
  component: ResetPasswordPage,
})

function ResetPasswordPage() {
  const t = useT()
  const navigate = useNavigate()
  const { token } = Route.useSearch()
  const [expired, setExpired] = React.useState(!token)
  const reset = useMutation({
    mutationFn: (password: string) => client.api.auth.resetPassword({ body: { token, password } }),
  })

  return (
    <AuthLayout brand={<Brand />}>
      <ResetPasswordForm
        minPasswordLength={PASSWORD_POLICY.minLength}
        pending={reset.isPending}
        error={
          expired && (
            <>
              {t.reset.expired}{' '}
              <Link to="/forgot-password" className="font-medium underline underline-offset-4">
                {t.reset.requestNew}
              </Link>
            </>
          )
        }
        onSubmit={async (password) => {
          try {
            await reset.mutateAsync(password)
            toast.success(t.reset.changed)
            await navigate({ to: '/login', replace: true })
          } catch {
            setExpired(true)
          }
        }}
      />
    </AuthLayout>
  )
}
