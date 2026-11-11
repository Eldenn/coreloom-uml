// One agent conventions configuration on its own page: rename it, change its project, and the
// questionnaire, rules, generations and summary also shown in its project's tab.
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { FolderInputIcon, PencilIcon } from 'lucide-react'
import * as React from 'react'
import { z } from 'zod'

import { MoveAgentConfigDialog, RenameAgentConfigDialog } from '@/agent-configs/agent-config-list'
import { AgentConfigTab } from '@/agent-configs/agent-config-tab'
import { ProjectLabel } from '@/architectures/architecture-list'
import { PageHeader } from '@/components/app-shell'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { type AgentConfig, agentConfigQueryOptions, useAgentConfig } from '@/lib/agent-configs'
import { agentConfigCrumbs } from '@/lib/crumbs'
import { useT } from '@/lib/locale'
import { type Project, projectQueryOptions, useProjects } from '@/lib/projects'

export const Route = createFileRoute('/_authed/agent-configs/$id')({
  params: {
    parse: ({ id }) => ({ id: z.coerce.number().int().positive().parse(id) }),
    stringify: ({ id }) => ({ id: String(id) }),
  },
  // `step=questions` for the questionnaire and `generation=<id>` for generated files.
  validateSearch: z.object({
    step: z.enum(['questions']).optional().catch(undefined),
    generation: z.coerce.number().int().positive().optional().catch(undefined),
  }),
  // Its project (if any) and name, for the breadcrumbs; the page shows its own error if it can't load.
  loader: async ({ context: { queryClient }, params: { id } }): Promise<CrumbData | null> => {
    try {
      const { config } = await queryClient.query({
        ...agentConfigQueryOptions(id),
        staleTime: 'static',
      })
      const project =
        config.projectId === null
          ? null
          : await queryClient.query({
              ...projectQueryOptions(config.projectId),
              staleTime: 'static',
            })
      return { project, id, name: config.name }
    } catch {
      return null
    }
  },
  staticData: {
    crumb: (t, data) => {
      const crumb = data as CrumbData | null
      const trail = agentConfigCrumbs(t, crumb?.project)
      return crumb ? [...trail, { label: crumb.name, href: `/agent-configs/${crumb.id}` }] : trail
    },
  },
  component: AgentConfigPage,
})

interface CrumbData {
  project: Project | null
  id: number
  name: string
}

function AgentConfigPage() {
  const t = useT()
  const { id } = Route.useParams()
  const config = useAgentConfig(id)

  if (config.isPending) return <Skeleton className="h-36 w-full" />
  if (config.isError)
    return (
      <Alert variant="destructive">
        <AlertTitle>{t.agents.loadFailed}</AlertTitle>
        <AlertDescription>
          <Button variant="outline" size="sm" onClick={() => void config.refetch()}>
            {t.agents.retry}
          </Button>
        </AlertDescription>
      </Alert>
    )
  return <AgentConfigPageView config={config.data.config} />
}

function AgentConfigPageView({ config }: { config: AgentConfig }) {
  const t = useT()
  const router = useRouter()
  const navigate = useNavigate({ from: Route.fullPath })
  const { step, generation } = Route.useSearch()
  const projects = useProjects()
  const [renaming, setRenaming] = React.useState(false)
  const [moving, setMoving] = React.useState(false)
  // The breadcrumbs read the name and the project through the route loader.
  const refreshCrumbs = () => void router.invalidate()

  return (
    <>
      <PageHeader
        title={config.name}
        description={
          <ProjectLabel projects={projects.data?.data ?? []} projectId={config.projectId} />
        }
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setRenaming(true)
              }}
            >
              <PencilIcon /> {t.agents.rename}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setMoving(true)
              }}
            >
              <FolderInputIcon /> {t.architectures.move}
            </Button>
          </>
        }
      />
      <AgentConfigTab
        configId={config.id}
        view={{ step, generation }}
        onViewChange={(view) => void navigate({ search: view })}
        onDeleted={() => void navigate({ to: '/agent-configs', replace: true })}
      />
      <RenameAgentConfigDialog
        config={config}
        open={renaming}
        onOpenChange={setRenaming}
        onSaved={refreshCrumbs}
      />
      <MoveAgentConfigDialog
        config={config}
        open={moving}
        onOpenChange={setMoving}
        onSaved={refreshCrumbs}
      />
    </>
  )
}
