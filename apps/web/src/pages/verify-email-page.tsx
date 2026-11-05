import { AuthCard } from '@coreloom-uml/ui'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { client, getErrorMessage } from '../lib/client'

export function VerifyEmailPage() {
  const { t } = useTranslation()
  const { token } = useSearch({ from: '/verify-email' })

  const { isSuccess, isError, error } = useQuery({
    queryKey: ['verify-email', token],
    queryFn: () => {
      if (token == null) throw new Error('unreachable: query disabled while token is null')
      return client.api.auth.verifyEmail({ query: { token } })
    },
    enabled: token != null,
    retry: false,
  })

  let message = t('auth:verifyEmail.pending')
  let isFailure = false
  if (!token) {
    message = t('auth:verifyEmail.missingToken')
    isFailure = true
  } else if (isSuccess) {
    message = t('auth:verifyEmail.success')
  } else if (isError) {
    message = getErrorMessage(error, t('auth:verifyEmail.error'))
    isFailure = true
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <AuthCard
        title={t('auth:verifyEmail.title')}
        footer={
          <Link to="/account" className="text-sm underline underline-offset-4">
            {t('auth:verifyEmail.goToAccount')}
          </Link>
        }
      >
        <p className={isFailure ? 'text-destructive text-sm' : 'text-sm'}>{message}</p>
      </AuthCard>
    </div>
  )
}
