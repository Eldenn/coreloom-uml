import { AuthCard, Button, Input, Label } from '@coreloom-uml/ui'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { client } from '../lib/client'

type FormValues = { email: string }

export function ForgotPasswordPage() {
  const { t } = useTranslation()
  const [sent, setSent] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { isSubmitting, isValid },
  } = useForm<FormValues>({ mode: 'onChange', defaultValues: { email: '' } })

  async function onSubmit({ email }: FormValues) {
    try {
      await client.api.auth.forgotPassword({ body: { email } })
    } finally {
      // Always show the same success state, whether or not the email is
      // registered — the API response is deliberately generic too.
      setSent(true)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <AuthCard
        title={t('auth:forgotPassword.title')}
        description={t('auth:forgotPassword.description')}
        footer={
          <p className="text-muted-foreground text-sm">
            <Link to="/login" className="underline underline-offset-4">
              {t('auth:forgotPassword.backToSignIn')}
            </Link>
          </p>
        }
      >
        {sent ? (
          <p className="text-sm">{t('auth:forgotPassword.sent')}</p>
        ) : (
          <form className="flex flex-col gap-6" onSubmit={handleSubmit(onSubmit)}>
            <div className="grid gap-2">
              <Label htmlFor="forgot-email">{t('auth:forgotPassword.email')}</Label>
              <Input
                id="forgot-email"
                type="email"
                autoComplete="email"
                disabled={isSubmitting}
                {...register('email', { required: true })}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting || !isValid}>
              {t('auth:forgotPassword.submit')}
            </Button>
          </form>
        )}
      </AuthCard>
    </div>
  )
}
