import { DropdownMenuItem, LanguageSwitcher, UserMenu } from '@coreloom-uml/ui'
import { Link, Outlet, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../auth/auth-context'
import i18n, { supportedLanguages } from '../../i18n'
import { apiBaseUrl } from '../../lib/client'

/** Shell for authenticated pages: header (nav + user menu + language) around an <Outlet/>. */
export function AppLayout() {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await logout()
    navigate({ to: '/login' })
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between gap-4 border-b px-4 py-3">
        <div className="flex items-center gap-6">
          <Link to="/dashboard" className="font-semibold">
            {t('common:appName')}
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link
              to="/dashboard"
              activeProps={{ className: 'font-medium text-foreground' }}
              inactiveProps={{ className: 'text-muted-foreground hover:text-foreground' }}
            >
              {t('common:nav.dashboard')}
            </Link>
            <Link
              to="/notes"
              activeProps={{ className: 'font-medium text-foreground' }}
              inactiveProps={{ className: 'text-muted-foreground hover:text-foreground' }}
            >
              {t('common:nav.notes')}
            </Link>
            <Link
              to="/account"
              activeProps={{ className: 'font-medium text-foreground' }}
              inactiveProps={{ className: 'text-muted-foreground hover:text-foreground' }}
            >
              {t('common:nav.account')}
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher
            value={i18n.language}
            onChange={(code) => i18n.changeLanguage(code)}
            options={[...supportedLanguages]}
            label={t('common:language')}
          />
          <UserMenu
            user={{
              name: user?.fullName,
              email: user?.email,
              avatarUrl: user?.avatarUrl ? `${apiBaseUrl}${user.avatarUrl}` : null,
            }}
            onSignOut={handleSignOut}
            signOutLabel={t('common:signOut')}
            items={
              <DropdownMenuItem asChild>
                <Link to="/account">{t('common:nav.account')}</Link>
              </DropdownMenuItem>
            }
          />
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
