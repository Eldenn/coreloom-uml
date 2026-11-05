import { User } from 'lucide-react'
import type * as React from 'react'

import { cn } from '../../lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'

type UserMenuUser = {
  name?: string | null
  email?: string | null
  avatarUrl?: string | null
}

type UserMenuProps = {
  user: UserMenuUser
  onSignOut: () => void
  signOutLabel?: string
  items?: React.ReactNode
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'right' | 'bottom' | 'left'
  className?: string
}

function initialsFromUser(user: UserMenuUser): string {
  const source = user.name?.trim() || user.email?.trim() || ''
  if (!source) return ''
  const parts = source.split(/\s+/).filter(Boolean)
  const first = parts[0] ?? ''
  const second = parts[1]
  const letters = second ? `${first.charAt(0)}${second.charAt(0)}` : first.slice(0, 2)
  return letters.toUpperCase()
}

function UserMenu({
  user,
  onSignOut,
  signOutLabel = 'Sign out',
  items,
  align = 'end',
  side,
  className,
}: UserMenuProps) {
  const initials = initialsFromUser(user)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-slot="user-menu-trigger"
        aria-label="Open user menu"
        className={cn('rounded-full outline-none focus-visible:ring-[3px]', className)}
      >
        <Avatar>
          {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={user.name ?? ''} /> : null}
          <AvatarFallback>{initials || <User className="size-4" />}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} {...(side !== undefined ? { side } : {})} className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          {user.name ? <span className="text-sm font-medium">{user.name}</span> : null}
          {user.email ? (
            <span className="text-muted-foreground text-xs font-normal">{user.email}</span>
          ) : null}
        </DropdownMenuLabel>
        {items ? (
          <>
            <DropdownMenuSeparator />
            {items}
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onSignOut()}>{signOutLabel}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export type { UserMenuProps, UserMenuUser }
export { UserMenu }
