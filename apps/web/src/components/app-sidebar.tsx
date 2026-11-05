'use client'

// Coreloom UI — AppSidebar (app-shell block). Workspace switcher, grouped navigation, secondary
// links and the account menu, on the Sidebar component. Navigation is data: pass your routes.
// Links go through AppLink: wrap the app in CoreloomLinkProvider to navigate with your router.
import { ChevronsUpDownIcon, PlusIcon } from 'lucide-react'
import * as React from 'react'

import { NavUser, type NavUserProps } from '@/components/nav-user'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import { useCoreloomI18n } from '@/lib/i18n'
import { type IconLike, renderIcon } from '@/lib/icon'
import { AppLink } from '@/lib/link'

interface NavItem {
  title: string
  url: string
  icon: IconLike
  isActive?: boolean
  badge?: React.ReactNode
}

interface NavGroup {
  label: string
  items: NavItem[]
}

interface Workspace {
  name: string
  plan?: string
  logo?: React.ReactNode
}

function NavLinks({ items, size }: { items: NavItem[]; size?: 'sm' | 'default' }) {
  return (
    <SidebarMenu>
      {items.map((item) => (
        <SidebarMenuItem key={item.title}>
          <SidebarMenuButton asChild isActive={item.isActive} tooltip={item.title} size={size}>
            <AppLink href={item.url} aria-current={item.isActive ? 'page' : undefined}>
              {renderIcon(item.icon)}
              <span>{item.title}</span>
            </AppLink>
          </SidebarMenuButton>
          {item.badge != null && <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>}
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  )
}

function WorkspaceSwitcher({
  workspaces,
  active,
  onSelect,
  onCreate,
}: {
  workspaces: Workspace[]
  active: Workspace
  onSelect?: (workspace: Workspace) => void
  onCreate?: () => void
}) {
  const t = useCoreloomI18n().messages
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
              <WorkspaceLogo workspace={active} />
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate font-display text-[15px] font-semibold text-foreground">
                  {active.name}
                </span>
                {active.plan && (
                  <span className="truncate font-mono text-[11px] text-muted-foreground">
                    {active.plan}
                  </span>
                )}
              </div>
              <ChevronsUpDownIcon className="ml-auto text-muted-foreground" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
          >
            <DropdownMenuLabel>{t.appShell.workspaces}</DropdownMenuLabel>
            {workspaces.map((workspace, i) => (
              <DropdownMenuItem key={workspace.name} onSelect={() => onSelect?.(workspace)}>
                <WorkspaceLogo workspace={workspace} small />
                {workspace.name}
                {i < 9 && <DropdownMenuShortcut>⌘{i + 1}</DropdownMenuShortcut>}
              </DropdownMenuItem>
            ))}
            {onCreate && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onCreate}>
                  <PlusIcon />
                  {t.appShell.newWorkspace}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

/** The workspace's logo, or its initial on a graphite tile. */
function WorkspaceLogo({ workspace, small }: { workspace: Workspace; small?: boolean }) {
  const size = small ? 'size-5 rounded-[5px] text-[11px]' : 'size-8 rounded-[7px] text-[14px]'
  if (workspace.logo)
    return <span className={`flex shrink-0 overflow-hidden ${size}`}>{workspace.logo}</span>
  return (
    <span
      className={`flex shrink-0 items-center justify-center border border-border bg-surface font-display font-bold text-primary ${size}`}
    >
      {workspace.name.charAt(0).toUpperCase()}
    </span>
  )
}

function AppSidebar({
  workspaces,
  activeWorkspace,
  onWorkspaceSelect,
  onWorkspaceCreate,
  groups,
  secondary,
  user,
  menu,
  onSignOut,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  workspaces: Workspace[]
  activeWorkspace?: Workspace
  onWorkspaceSelect?: (workspace: Workspace) => void
  onWorkspaceCreate?: () => void
  groups: NavGroup[]
  /** Small links pinned above the account menu (Support, Docs). */
  secondary?: NavItem[]
  user: NavUserProps['user']
} & Pick<NavUserProps, 'menu' | 'onSignOut'>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <WorkspaceSwitcher
          workspaces={workspaces}
          active={activeWorkspace ?? workspaces[0]}
          onSelect={onWorkspaceSelect}
          onCreate={onWorkspaceCreate}
        />
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <NavLinks items={group.items} />
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
        {secondary && secondary.length > 0 && (
          <SidebarGroup className="mt-auto">
            <SidebarGroupContent>
              <NavLinks items={secondary} size="sm" />
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} menu={menu} onSignOut={onSignOut} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

export { AppSidebar, type NavGroup, type NavItem, type Workspace }
