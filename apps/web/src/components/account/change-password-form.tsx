import { validatePassword } from '@coreloom-uml/auth-policy'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  PasswordRequirements,
} from '@coreloom-uml/ui'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../auth/auth-context'
import { client, getErrorMessage } from '../../lib/client'

type FormValues = { currentPassword: string; newPassword: string }

export function ChangePasswordForm() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [done, setDone] = useState(false)
  const {
    register,
    handleSubmit,
    watch,
    reset,
    setError,
    formState: { errors, isSubmitting, isValid },
  } = useForm<FormValues>({
    mode: 'onChange',
    defaultValues: { currentPassword: '', newPassword: '' },
  })

  const passwordContext = { email: user?.email, name: user?.fullName ?? undefined }

  async function onSubmit(values: FormValues) {
    setDone(false)
    try {
      await client.api.account.changePassword({ body: values })
      reset()
      setDone(true)
    } catch (err) {
      setError('root', { message: getErrorMessage(err, t('account:password.error')) })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('account:password.title')}</CardTitle>
        <CardDescription>{t('account:password.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
          {errors.root ? (
            <p role="alert" className="text-destructive text-sm">
              {errors.root.message}
            </p>
          ) : null}
          {done ? <p className="text-sm">{t('account:password.changed')}</p> : null}
          <div className="grid gap-2">
            <Label htmlFor="current-password">{t('account:password.current')}</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              disabled={isSubmitting}
              {...register('currentPassword', { required: true })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new-password">{t('account:password.new')}</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              disabled={isSubmitting}
              {...register('newPassword', {
                required: true,
                validate: (value) =>
                  validatePassword(value, passwordContext).length === 0 ||
                  t('account:password.policy'),
              })}
            />
          </div>
          <PasswordRequirements password={watch('newPassword')} context={passwordContext} />
          <Button type="submit" disabled={isSubmitting || !isValid}>
            {t('account:password.submit')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
