import { PASSWORD_POLICY } from '@coreloom-uml/auth-policy'
import { createFileRoute, Navigate, useNavigate } from '@tanstack/react-router'
import * as React from 'react'

import { useAuth } from '@/auth/auth-context'
import { AuthLayout } from '@/components/auth-layout'
import { Brand } from '@/components/brand'
import { SignupForm } from '@/components/signup-form'
import { useAuthOptions } from '@/lib/auth-options'
import { getErrorMessage } from '@/lib/client'
import { useT } from '@/lib/locale'

export const Route = createFileRoute('/register')({
  component: RegisterPage,
})

/** Only reachable while REGISTRATION_ENABLED=true on the API (RM-06). */
function RegisterPage() {
  const t = useT()
  const navigate = useNavigate()
  const { user, register } = useAuth()
  const options = useAuthOptions()
  const [error, setError] = React.useState<string>()

  if (user) return <Navigate to="/architectures" replace />
  if (options.data && !options.data.registrationEnabled) return <Navigate to="/login" replace />

  return (
    <AuthLayout brand={<Brand />}>
      <SignupForm
        signInHref="/login"
        minPasswordLength={PASSWORD_POLICY.minLength}
        error={error}
        onSubmit={async ({ name, email, password }) => {
          setError(undefined)
          try {
            await register(email, password, name || undefined)
            await navigate({ to: '/architectures', replace: true })
          } catch (err) {
            setError(getErrorMessage(err, t.signup.emailTaken))
          }
        }}
      />
    </AuthLayout>
  )
}
