// The signed-in area: every route under `_authed.*` renders inside the app shell; signed-out
// visitors are sent to /login first (then back where they were going).
import {
  createFileRoute,
  Outlet,
  redirect,
  useLocation,
  useNavigate,
  useRouter,
  useRouterState,
} from '@tanstack/react-router'
import { FolderIcon, LanguagesIcon, PlusIcon, SettingsIcon } from 'lucide-react'
import * as React from 'react'

import { meQueryOptions, useAuth } from '@/auth/auth-context'
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
  // Runs before any page under it loads or renders, so a signed-out visitor never reaches one.
  beforeLoad: async ({ context, location }) => {
    const user = await context.queryClient.query({ ...meQueryOptions, staleTime: 'static' })
    if (!user) throw redirect({ to: '/login', search: { redirect: location.href }, replace: true })
  },
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
  const router = useRouter()
  const location = useLocation()
  const signingOut = React.useRef(false)
  // The page's breadcrumbs come from the matched routes' `staticData.crumb` / loader data.
  const crumbs = useRouterState({
    select: (state) =>
      state.matches.flatMap((match) => {
        const crumb = match.staticData.crumb?.(t, match.loaderData)
        if (crumb === undefined) return []
        return typeof crumb === 'string'
          ? [{ label: crumb, href: match.pathname.replace(/(.)\/$/, '$1') }]
          : crumb
      }),
  })

  const fullWidth = useRouterState({
    select: (state) => state.matches.some((match) => match.staticData.fullWidth),
  })

  // Signed out while on a page (session expired, a 401 from the API): back to /login, then here.
  // Signing out from the menu goes to /login without coming back.
  React.useEffect(() => {
    if (isLoading || user || signingOut.current) return
    void router.navigate({
      to: '/login',
      search: { redirect: router.state.location.href },
      replace: true,
    })
  }, [isLoading, user, router])

  if (isLoading || !user) return null

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
        signingOut.current = true
        try {
          await logout()
          await navigate({ to: '/login' })
        } finally {
          signingOut.current = false
        }
      }}
      groups={[
        {
          label: t.shell.main,
          items: [
            {
              title: t.nav.projects,
              url: '/projects',
              icon: FolderIcon,
              // An architecture opens inside its project.
              isActive: isActive('/projects') || isActive('/architectures'),
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
      breadcrumbs={[{ label: t.brand, href: '/projects' }, ...crumbs]}
      commands={[
        {
          heading: t.shell.goTo,
          items: [
            {
              label: t.nav.projects,
              icon: FolderIcon,
              onSelect: () => void navigate({ to: '/projects' }),
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
              label: t.projects.new,
              icon: PlusIcon,
              onSelect: () => void navigate({ to: '/projects', search: { new: true } }),
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
