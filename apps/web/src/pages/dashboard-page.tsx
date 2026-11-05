import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/auth-context'

export function DashboardPage() {
  const { t } = useTranslation()
  const { user } = useAuth()

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 p-4 py-10">
      <h1 className="font-semibold text-xl">{t('common:dashboard.title')}</h1>
      <p className="text-sm">
        {t('common:dashboard.welcome', { name: user?.fullName || user?.email })}
      </p>
      <p className="text-muted-foreground text-sm">{t('common:dashboard.body')}</p>
    </div>
  )
}
