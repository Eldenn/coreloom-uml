import type { PasswordContext } from '@coreloom-uml/auth-policy'
import { validatePassword } from '@coreloom-uml/auth-policy'
import { AuthCard, Button, Input, Label, PasswordRequirements } from '@coreloom-uml/ui'
import { Link, useNavigate } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/auth-context'
import { getErrorMessage } from '../lib/client'

type FormValues = { fullName: string; email: string; password: string }

export function RegisterPage() {
  const { t } = useTranslation()
  const { register: registerUser } = useAuth()
  const navigate = useNavigate()
  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting, isValid },
  } = useForm<FormValues>({
    mode: 'onChange',
    defaultValues: { fullName: '', email: '', password: '' },
  })

  const password = watch('password')
  const passwordContext: PasswordContext = { email: watch('email'), name: watch('fullName') }

  async function onSubmit(values: FormValues) {
    try {
      await registerUser(values.email, values.password, values.fullName || undefined)
      navigate({ to: '/dashboard' })
    } catch (err) {
      setError('root', { message: getErrorMessage(err, t('auth:register.error')) })
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <AuthCard
        title={t('auth:register.title')}
        description={t('auth:register.description')}
        footer={
          <p className="text-muted-foreground text-sm">
            {t('auth:register.haveAccount')}{' '}
            <Link to="/login" className="underline underline-offset-4">
              {t('auth:register.signIn')}
            </Link>
          </p>
        }
      >
        <form className="flex flex-col gap-6" onSubmit={handleSubmit(onSubmit)}>
          {errors.root ? (
            <p role="alert" className="text-destructive text-sm">
              {errors.root.message}
            </p>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="register-name">{t('auth:register.fullName')}</Label>
            <Input
              id="register-name"
              autoComplete="name"
              disabled={isSubmitting}
              {...register('fullName')}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="register-email">{t('auth:register.email')}</Label>
            <Input
              id="register-email"
              type="email"
              autoComplete="email"
              disabled={isSubmitting}
              {...register('email', { required: true })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="register-password">{t('auth:register.password')}</Label>
            <Input
              id="register-password"
              type="password"
              autoComplete="new-password"
              disabled={isSubmitting}
              {...register('password', {
                required: true,
                validate: (value, values) =>
                  validatePassword(value, { email: values.email, name: values.fullName }).length ===
                    0 || t('auth:register.passwordPolicy'),
              })}
            />
          </div>
          <PasswordRequirements password={password} context={passwordContext} />
          <Button type="submit" className="w-full" disabled={isSubmitting || !isValid}>
            {t('auth:register.submit')}
          </Button>
        </form>
      </AuthCard>
    </div>
  )
}
