import { createFileRoute, useNavigate } from '@tanstack/react-router'
import * as React from 'react'
import { z } from 'zod'

import { useAuth } from '@/auth/auth-context'
import { AuthLayout } from '@/components/auth-layout'
import { Brand } from '@/components/brand'
import { LoginForm } from '@/components/login-form'
import { useAuthOptions } from '@/lib/auth-options'
import { useT } from '@/lib/locale'

export const Route = createFileRoute('/login')({
  // Where to go after signing in; set by the signed-in layout (src/routes/_authed.tsx).
  // Same-site paths only: `//host` would leave the app.
  validateSearch: z.object({
    redirect: z
      .string()
      .regex(/^\/(?![/\\])/)
      .optional()
      .catch(undefined),
  }),
  component: LoginPage,
})

function LoginPage() {
  const t = useT()
  const navigate = useNavigate()
  const { user, login } = useAuth()
  const options = useAuthOptions()
  const { redirect: next } = Route.useSearch()
  const [error, setError] = React.useState<string>()

  // Already signed in (or just signed in): go where the visitor was heading.
  React.useEffect(() => {
    if (user) void navigate({ href: next ?? '/architectures', replace: true })
  }, [user, next, navigate])
  if (user) return null

  return (
    <AuthLayout brand={<Brand />}>
      <LoginForm
        signUpHref={options.data?.registrationEnabled ? '/register' : undefined}
        forgotPasswordHref="/forgot-password"
        error={error}
        onSubmit={async ({ email, password }) => {
          setError(undefined)
          try {
            await login(email, password)
          } catch {
            setError(t.login.wrongCredentials)
          }
        }}
      />
    </AuthLayout>
  )
}
