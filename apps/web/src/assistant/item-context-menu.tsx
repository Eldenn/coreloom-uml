// The menu a right-click (or a long press) opens on an item of the account's work: what its "…"
// menu offers, and putting it in the assistant's context. The same actions stay in the "…" menu,
// which the keyboard reaches.
import type * as React from 'react'

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import type { ItemAction } from '@/lib/assistant-context'

export function ItemContextMenu({
  actions,
  children,
}: {
  actions: readonly ItemAction[]
  children: React.ReactNode
}) {
  if (actions.length === 0) return children
  return (
    <ContextMenu>
      {/* `contents`: the wrapper hears the right-click and leaves the layout to its child. */}
      <ContextMenuTrigger asChild>
        <div className="contents">{children}</div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {actions.map((action) => (
          <ContextMenuItem
            key={action.label}
            variant={action.destructive ? 'destructive' : 'default'}
            onSelect={action.onSelect}
          >
            {action.icon}
            {action.label}
          </ContextMenuItem>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  )
}
