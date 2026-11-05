import { Button } from '@coreloom-uml/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/auth-context'

export function HomePage() {
  const { t } = useTranslation()
  const { user } = useAuth()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-4 text-center">
      <h1 className="font-semibold text-3xl">{t('common:appName')}</h1>
      <p className="text-muted-foreground max-w-md">{t('common:tagline')}</p>
      <div className="flex gap-3">
        {user ? (
          <Button asChild>
            <Link to="/dashboard">{t('common:actions.goToAccount')}</Link>
          </Button>
        ) : (
          <>
            <Button asChild>
              <Link to="/login">{t('common:signIn')}</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/register">{t('common:createAccount')}</Link>
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
