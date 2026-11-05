import { useMutation } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import { AuthLayout } from '@/components/auth-layout'
import { Brand } from '@/components/brand'
import { ForgotPasswordForm } from '@/components/password-reset-form'
import { client } from '@/lib/client'

export const Route = createFileRoute('/forgot-password')({
  component: ForgotPasswordPage,
})

function ForgotPasswordPage() {
  const request = useMutation({
    mutationFn: (email: string) => client.api.auth.forgotPassword({ body: { email } }),
  })
  return (
    <AuthLayout brand={<Brand />}>
      <ForgotPasswordForm
        signInHref="/login"
        pending={request.isPending}
        onSubmit={(email) => request.mutateAsync(email)}
      />
    </AuthLayout>
  )
}
