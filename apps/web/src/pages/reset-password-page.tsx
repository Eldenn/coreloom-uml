import { validatePassword } from '@coreloom-uml/auth-policy'
import { AuthCard, Button, Input, Label, PasswordRequirements } from '@coreloom-uml/ui'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { client, getErrorMessage } from '../lib/client'

type FormValues = { password: string }

export function ResetPasswordPage() {
  const { t } = useTranslation()
  const { token = '' } = useSearch({ from: '/reset-password' })
  const navigate = useNavigate()
  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting, isValid },
  } = useForm<FormValues>({ mode: 'onChange', defaultValues: { password: '' } })

  async function onSubmit({ password }: FormValues) {
    try {
      await client.api.auth.resetPassword({ body: { token, password } })
      navigate({ to: '/login' })
    } catch (err) {
      setError('root', { message: getErrorMessage(err, t('auth:resetPassword.error')) })
    }
  }

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <AuthCard
          title={t('auth:resetPassword.invalidTitle')}
          description={t('auth:resetPassword.invalidDescription')}
        >
          <Link to="/forgot-password" className="text-sm underline underline-offset-4">
            {t('auth:resetPassword.requestNew')}
          </Link>
        </AuthCard>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <AuthCard
        title={t('auth:resetPassword.title')}
        description={t('auth:resetPassword.description')}
      >
        <form className="flex flex-col gap-6" onSubmit={handleSubmit(onSubmit)}>
          {errors.root ? (
            <p role="alert" className="text-destructive text-sm">
              {errors.root.message}
            </p>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="reset-password">{t('auth:resetPassword.newPassword')}</Label>
            <Input
              id="reset-password"
              type="password"
              autoComplete="new-password"
              disabled={isSubmitting}
              {...register('password', {
                required: true,
                validate: (value) =>
                  validatePassword(value).length === 0 || t('auth:resetPassword.passwordPolicy'),
              })}
            />
          </div>
          <PasswordRequirements password={watch('password')} />
          <Button type="submit" className="w-full" disabled={isSubmitting || !isValid}>
            {t('auth:resetPassword.submit')}
          </Button>
        </form>
      </AuthCard>
    </div>
  )
}
