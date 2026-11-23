import { PencilIcon, Trash2Icon } from 'lucide-react'

import type { DiagramContextAction, UmlContextTarget } from '@/components/ui/uml-diagram'
import type { Messages } from '@/lib/i18n'

/** What a context menu of the workspace acts on: a view, or a part of the open view's drawing. */
type DiagramContextTarget =
  { type: 'view'; viewId: string; label: string } | (UmlContextTarget & { viewId: string })

/** The app's entries for a target of the workspace. */
type WorkspaceContextActions = (target: DiagramContextTarget) => readonly DiagramContextAction[]

type ViewTarget = Extract<DiagramContextTarget, { type: 'view' }>

/** The list's context menu: Rename and Delete (asked first, as with the buttons), then the app's. */
function viewMenu(input: {
  diagrams: readonly { id: string; title: string }[]
  contextActions: WorkspaceContextActions | undefined
  tools: Messages['diagramTools']
  onRename: (id: string) => void
  onDelete: (id: string) => void
}) {
  const { diagrams, contextActions, tools } = input
  return {
    enabled: contextActions !== undefined,
    resolve: (element: Element): ViewTarget | null => {
      const id = element.closest('[data-view-id]')?.getAttribute('data-view-id')
      const item = diagrams.find((d) => d.id === id)
      return item ? { type: 'view', viewId: item.id, label: item.title } : null
    },
    lists: (target: ViewTarget) => ({
      own: [
        {
          label: tools.rename,
          icon: <PencilIcon aria-hidden />,
          onSelect: () => {
            input.onRename(target.viewId)
          },
        },
        {
          label: tools.delete,
          icon: <Trash2Icon aria-hidden />,
          destructive: true,
          // Like the list's button: a document keeps at least one view.
          disabled: diagrams.length === 1,
          onSelect: () => {
            input.onDelete(target.viewId)
          },
        },
      ],
      app: contextActions?.(target) ?? [],
    }),
  }
}

/** The editor's `contextActions` for the open view: the app's, told which view it is. */
function forView(contextActions: WorkspaceContextActions | undefined, viewId: string) {
  if (!contextActions) return {}
  return {
    contextActions: (target: UmlContextTarget) => contextActions({ ...target, viewId }),
  }
}

export { type DiagramContextTarget, forView, viewMenu, type WorkspaceContextActions }
