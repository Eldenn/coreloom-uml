// The assistant from every page: a button in the shell's header that opens the panel in a side
// sheet. An architecture's page has its own toggle, which docks the panel beside the workspace.
import { useRouterState } from '@tanstack/react-router'
import { SparklesIcon } from 'lucide-react'
import * as React from 'react'

import { AssistantSheet } from '@/assistant/assistant-panel'
import { Button } from '@/components/ui/button'
import { useFeature } from '@/lib/feature-flags'
import { useT } from '@/lib/locale'

type PageRoute =
  '/_authed/architectures/$id' | '/_authed/agent-configs/$id' | '/_authed/projects/$projectId'

/** The id in the address of the page shown, when it is a page of that kind. */
function usePageId(routeId: PageRoute, name: 'id' | 'projectId'): number | null {
  return useRouterState({
    select: (state) => {
      const params = state.matches.find((match) => match.routeId === routeId)?.params as
        Record<string, unknown> | undefined
      const value = params?.[name]
      return typeof value === 'number' ? value : null
    },
  })
}

export function AssistantButton() {
  const t = useT().assistant
  const enabled = useFeature('diagram-assistant')
  const [open, setOpen] = React.useState(false)
  const onArchitecture = usePageId('/_authed/architectures/$id', 'id') !== null
  const pageConfigId = usePageId('/_authed/agent-configs/$id', 'id')
  const pageProjectId = usePageId('/_authed/projects/$projectId', 'projectId')
  if (!enabled || onArchitecture) return null
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        aria-haspopup="dialog"
        onClick={() => {
          setOpen(true)
        }}
      >
        <SparklesIcon />
        {t.open}
      </Button>
      <AssistantSheet
        open={open}
        onOpenChange={setOpen}
        pageConfigId={pageConfigId}
        pageProjectId={pageProjectId}
      />
    </>
  )
}
