import { AuthCard, LoginForm } from '@coreloom-uml/ui'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/auth-context'
import { getErrorMessage } from '../lib/client'

export function LoginPage() {
  const { t } = useTranslation()
  const { login } = useAuth()
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit({ email, password }: { email: string; password: string }) {
    setIsLoading(true)
    setError(null)
    try {
      await login(email, password)
      navigate({ to: '/dashboard' })
    } catch (err) {
      setError(getErrorMessage(err, t('auth:login.error')))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <AuthCard
        title={t('auth:login.title')}
        description={t('auth:login.description')}
        footer={
          <p className="text-muted-foreground text-sm">
            {t('auth:login.noAccount')}{' '}
            <Link to="/register" className="underline underline-offset-4">
              {t('auth:login.createOne')}
            </Link>
          </p>
        }
      >
        <LoginForm
          onSubmit={handleSubmit}
          isLoading={isLoading}
          error={error}
          emailLabel={t('auth:login.emailLabel')}
          passwordLabel={t('auth:login.passwordLabel')}
          submitLabel={t('auth:login.submit')}
          forgotPassword={
            <Link to="/forgot-password" className="text-sm underline underline-offset-4">
              {t('auth:login.forgotPassword')}
            </Link>
          }
        />
      </AuthCard>
    </div>
  )
}
