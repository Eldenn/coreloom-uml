import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@coreloom-uml/ui'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../auth/auth-context'
import { client, getErrorMessage } from '../../lib/client'

type FormValues = { fullName: string; email: string }

export function ProfileForm() {
  const { t } = useTranslation()
  const { user, refresh } = useAuth()
  const [status, setStatus] = useState<'idle' | 'saved' | 'verify-sent'>('idle')
  const {
    register,
    handleSubmit,
    watch,
    reset,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({
    defaultValues: { fullName: user?.fullName ?? '', email: user?.email ?? '' },
  })

  const emailChanged = watch('email').trim().toLowerCase() !== (user?.email ?? '')

  async function onSubmit(values: FormValues) {
    setStatus('idle')
    const nextFullName = values.fullName.trim() || null
    const nextEmail = values.email.trim().toLowerCase()

    const body: { fullName?: string | null; email?: string } = {}
    if (nextFullName !== (user?.fullName ?? null)) body.fullName = nextFullName
    if (nextEmail !== (user?.email ?? '')) body.email = nextEmail

    try {
      await client.api.account.updateProfile({ body })
      await refresh()
      reset({ fullName: nextFullName ?? '', email: nextEmail })
      setStatus(body.email ? 'verify-sent' : 'saved')
    } catch (err) {
      setError('root', { message: getErrorMessage(err, t('account:profile.error')) })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('account:profile.title')}</CardTitle>
        <CardDescription>{t('account:profile.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
          {errors.root ? (
            <p role="alert" className="text-destructive text-sm">
              {errors.root.message}
            </p>
          ) : null}
          {status === 'saved' ? <p className="text-sm">{t('account:profile.saved')}</p> : null}
          {status === 'verify-sent' ? (
            <p className="text-sm">{t('account:profile.verifySent')}</p>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="profile-name">{t('account:profile.fullName')}</Label>
            <Input
              id="profile-name"
              autoComplete="name"
              disabled={isSubmitting}
              {...register('fullName')}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="profile-email">{t('account:profile.email')}</Label>
            <Input
              id="profile-email"
              type="email"
              autoComplete="email"
              disabled={isSubmitting}
              {...register('email', { required: true })}
            />
            {emailChanged ? (
              <p className="text-muted-foreground text-xs">
                {t('account:profile.emailChangeHint')}
              </p>
            ) : null}
          </div>
          <Button type="submit" disabled={isSubmitting || !isDirty}>
            {t('account:profile.submit')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
