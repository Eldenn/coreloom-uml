import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@coreloom-uml/ui'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/auth-context'
import { AvatarForm } from '../components/account/avatar-form'
import { ChangePasswordForm } from '../components/account/change-password-form'
import { DeleteAccountDialog } from '../components/account/delete-account-dialog'
import { ProfileForm } from '../components/account/profile-form'
import { client } from '../lib/client'

export function AccountPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const resend = useMutation({ mutationFn: () => client.api.auth.resendVerification({}) })

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 p-4 py-10">
      <div>
        <h1 className="font-semibold text-xl">{t('account:title')}</h1>
        <p className="text-muted-foreground text-sm">{user?.email}</p>
      </div>

      {!user?.emailVerifiedAt ? (
        <div className="bg-muted flex flex-col gap-2 rounded-md p-3 text-sm">
          {resend.isSuccess ? (
            <p>{t('account:verifyBanner.sent')}</p>
          ) : (
            <>
              <p>{t('account:verifyBanner.unverified')}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={resend.isPending}
                onClick={() => resend.mutate()}
              >
                {t('account:verifyBanner.resend')}
              </Button>
              {resend.isError ? (
                <p className="text-destructive">{t('account:verifyBanner.error')}</p>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      <AvatarForm />
      <ProfileForm />
      <ChangePasswordForm />

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle>{t('account:danger.title')}</CardTitle>
          <CardDescription>{t('account:danger.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <DeleteAccountDialog />
        </CardContent>
      </Card>
    </div>
  )
}
