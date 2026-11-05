import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
} from '@coreloom-uml/ui'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../auth/auth-context'
import { client, getErrorMessage } from '../../lib/client'

type FormValues = { password: string }

export function DeleteAccountDialog() {
  const { t } = useTranslation()
  const { refresh } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting, isValid },
  } = useForm<FormValues>({ mode: 'onChange', defaultValues: { password: '' } })

  async function onSubmit({ password }: FormValues) {
    try {
      await client.api.account.destroy({ body: { password } })
      // The API has cleared the session; refresh drops the local user to null.
      await refresh()
      navigate({ to: '/' })
    } catch (err) {
      setError('root', { message: getErrorMessage(err, t('account:danger.error')) })
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button variant="destructive">{t('account:danger.delete')}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('account:danger.dialogTitle')}</DialogTitle>
          <DialogDescription>{t('account:danger.dialogDescription')}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
          {errors.root ? (
            <p role="alert" className="text-destructive text-sm">
              {errors.root.message}
            </p>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="delete-password">{t('account:danger.password')}</Label>
            <Input
              id="delete-password"
              type="password"
              autoComplete="current-password"
              disabled={isSubmitting}
              {...register('password', { required: true })}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isSubmitting}>
                {t('account:danger.cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={isSubmitting || !isValid}>
              {t('account:danger.delete')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
