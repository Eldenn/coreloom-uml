// The signed-in area: every route under `_authed.*` renders inside the app shell; signed-out
// visitors are sent to /login first (then back where they were going).
import {
  createFileRoute,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router'
import { LanguagesIcon, NetworkIcon, PlusIcon, SettingsIcon } from 'lucide-react'

import { useAuth } from '@/auth/auth-context'
import { AppShell } from '@/components/app-shell'
import { CatMark } from '@/components/brand'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { apiBaseUrl } from '@/lib/client'
import { type Locale, useLocale, useT } from '@/lib/locale'

export const Route = createFileRoute('/_authed')({
  component: AuthedLayout,
})

function LanguageMenu() {
  const { locale, setLocale } = useLocale()
  const t = useT()
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={t.shell.language}>
              <LanguagesIcon />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{t.shell.language}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t.shell.language}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={locale}
          onValueChange={(value) => {
            setLocale(value as Locale)
          }}
        >
          <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="fr">Français</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function AuthedLayout() {
  const t = useT()
  const { user, isLoading, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // The page's breadcrumbs come from the matched routes' `staticData.crumb` / loader data.
  const crumbs = useRouterState({
    select: (state) =>
      state.matches.flatMap((match) => {
        const crumb = match.staticData.crumb
        return crumb ? [{ label: crumb(t), href: match.pathname.replace(/(.)\/$/, '$1') }] : []
      }),
  })

  const fullWidth = useRouterState({
    select: (state) => state.matches.some((match) => match.staticData.fullWidth),
  })

  if (isLoading) return null
  if (!user) return <Navigate to="/login" search={{ redirect: location.href }} replace />

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`)

  return (
    <AppShell
      workspaces={[
        { name: t.brand, plan: t.shell.workspace, logo: <CatMark className="size-5" /> },
      ]}
      user={{
        name: user.fullName ?? user.email,
        email: user.email,
        avatar: user.avatarUrl ? `${apiBaseUrl}${user.avatarUrl}` : undefined,
      }}
      menu={[
        {
          label: t.nav.settings,
          icon: SettingsIcon,
          onSelect: () => void navigate({ to: '/settings' }),
        },
      ]}
      onSignOut={async () => {
        await logout()
        await navigate({ to: '/login' })
      }}
      groups={[
        {
          label: t.shell.main,
          items: [
            {
              title: t.nav.architectures,
              url: '/architectures',
              icon: NetworkIcon,
              isActive: isActive('/architectures'),
            },
            {
              title: t.nav.settings,
              url: '/settings',
              icon: SettingsIcon,
              isActive: isActive('/settings'),
            },
          ],
        },
      ]}
      breadcrumbs={[{ label: t.brand, href: '/architectures' }, ...crumbs]}
      commands={[
        {
          heading: t.shell.goTo,
          items: [
            {
              label: t.nav.architectures,
              icon: NetworkIcon,
              onSelect: () => void navigate({ to: '/architectures' }),
            },
            {
              label: t.nav.settings,
              icon: SettingsIcon,
              onSelect: () => void navigate({ to: '/settings' }),
            },
          ],
        },
        {
          heading: t.shell.actions,
          items: [
            {
              label: t.architectures.new,
              icon: PlusIcon,
              onSelect: () => void navigate({ to: '/architectures', search: { new: true } }),
            },
          ],
        },
      ]}
      headerActions={<LanguageMenu />}
      fullWidth={fullWidth}
    >
      <Outlet />
    </AppShell>
  )
}
