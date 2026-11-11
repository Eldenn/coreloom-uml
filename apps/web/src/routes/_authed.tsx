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
import {
  BotIcon,
  FlagIcon,
  FolderIcon,
  LanguagesIcon,
  NetworkIcon,
  PlusIcon,
  SettingsIcon,
  SparklesIcon,
} from 'lucide-react'
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

/** The page's breadcrumbs, from the matched routes' `staticData.crumb` / loader data. */
function useCrumbs() {
  const t = useT()
  return useRouterState({
    select: (state) =>
      state.matches.flatMap((match) => {
        const crumb = match.staticData.crumb?.(t, match.loaderData)
        if (crumb === undefined) return []
        return typeof crumb === 'string'
          ? [{ label: crumb, href: match.pathname.replace(/(.)\/$/, '$1') }]
          : crumb
      }),
  })
}

/** The ⌘K menu: every page, then the actions that open a "New …" dialog. */
function useCommands(isAdmin: boolean) {
  const t = useT()
  const navigate = useNavigate()
  return [
    {
      heading: t.shell.goTo,
      items: [
        {
          label: t.nav.projects,
          icon: FolderIcon,
          onSelect: () => void navigate({ to: '/projects' }),
        },
        {
          label: t.nav.architectures,
          icon: NetworkIcon,
          onSelect: () => void navigate({ to: '/architectures' }),
        },
        {
          label: t.nav.agentConfigs,
          icon: BotIcon,
          onSelect: () => void navigate({ to: '/agent-configs' }),
        },
        {
          label: t.nav.skills,
          icon: SparklesIcon,
          onSelect: () => void navigate({ to: '/skills' }),
        },
        ...(isAdmin
          ? [
              {
                label: t.nav.featureFlags,
                icon: FlagIcon,
                onSelect: () => void navigate({ to: '/feature-flags' }),
              },
            ]
          : []),
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
        {
          label: t.architectures.new,
          icon: PlusIcon,
          onSelect: () => void navigate({ to: '/architectures', search: { new: true } }),
        },
        {
          label: t.agents.new,
          icon: PlusIcon,
          onSelect: () => void navigate({ to: '/agent-configs', search: { new: true } }),
        },
      ],
    },
  ]
}

function AuthedLayout() {
  const t = useT()
  const { user, isLoading, logout } = useAuth()
  const navigate = useNavigate()
  const router = useRouter()
  const location = useLocation()
  const signingOut = React.useRef(false)
  const crumbs = useCrumbs()
  const commands = useCommands(user?.isAdmin ?? false)

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
              isActive: isActive('/projects'),
            },
            {
              title: t.nav.architectures,
              url: '/architectures',
              icon: NetworkIcon,
              isActive: isActive('/architectures'),
            },
            {
              title: t.nav.agentConfigs,
              url: '/agent-configs',
              icon: BotIcon,
              isActive: isActive('/agent-configs'),
            },
            {
              title: t.nav.skills,
              url: '/skills',
              icon: SparklesIcon,
              isActive: isActive('/skills'),
            },
            ...(user.isAdmin
              ? [
                  {
                    title: t.nav.featureFlags,
                    url: '/feature-flags',
                    icon: FlagIcon,
                    isActive: isActive('/feature-flags'),
                  },
                ]
              : []),
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
      commands={commands}
      headerActions={<LanguageMenu />}
      fullWidth={fullWidth}
    >
      <Outlet />
    </AppShell>
  )
}
