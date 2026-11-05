import { Button } from '@coreloom-uml/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

export function NotFoundPage() {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="font-mono text-muted-foreground text-sm">{t('common:notFound.code')}</p>
      <h1 className="font-semibold text-2xl">{t('common:notFound.title')}</h1>
      <p className="max-w-md text-muted-foreground text-sm">{t('common:notFound.body')}</p>
      <Button asChild>
        <Link to="/">{t('common:actions.backToHome')}</Link>
      </Button>
    </div>
  )
}
