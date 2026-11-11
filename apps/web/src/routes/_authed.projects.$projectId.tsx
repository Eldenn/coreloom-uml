// One project: its architectures as cards, its agent conventions in a second tab, and the
// project's own actions (rename, delete).
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import * as React from 'react'
import { z } from 'zod'

import { AgentConfigSetup } from '@/agent-configs/agent-config-setup'
import { AgentConfigTab, type AgentConfigView } from '@/agent-configs/agent-config-tab'
import { ArchitectureList, CreateArchitectureDialog } from '@/architectures/architecture-list'
import { PageHeader } from '@/components/app-shell'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAgentConfig, useAgentConfigs } from '@/lib/agent-configs'
import { useArchitectures } from '@/lib/architectures'
import { projectCrumbs } from '@/lib/crumbs'
import { useT } from '@/lib/locale'
import { type Project, projectQueryOptions, useProject } from '@/lib/projects'
import { DeleteProjectDialog, EditProjectDialog } from '@/projects/project-dialogs'

export const Route = createFileRoute('/_authed/projects/$projectId')({
  params: {
    parse: ({ projectId }) => ({ projectId: z.coerce.number().int().positive().parse(projectId) }),
    stringify: ({ projectId }) => ({ projectId: String(projectId) }),
  },
  // `?new=true` opens the "New architecture" dialog; `?tab=agents` shows the agent conventions,
  // with `step=questions` for the questionnaire and `generation=<id>` for generated files.
  validateSearch: z.object({
    new: z.boolean().optional().catch(undefined),
    tab: z.enum(['architectures', 'agents']).optional().catch(undefined),
    step: z.enum(['questions']).optional().catch(undefined),
    generation: z.coerce.number().int().positive().optional().catch(undefined),
  }),
  // The project's name, for the breadcrumbs; the page shows its own error if it can't load.
  loader: ({ context: { queryClient }, params: { projectId } }) =>
    queryClient.query({ ...projectQueryOptions(projectId), staleTime: 'static' }).catch(() => null),
  staticData: { crumb: (t, project) => projectCrumbs(t, project as Project | null) },
  component: ProjectPage,
})

function ProjectPage() {
  const t = useT()
  const { projectId } = Route.useParams()
  const project = useProject(projectId)

  if (project.isPending) return <Skeleton className="h-36 w-full" />
  if (project.isError)
    return (
      <Alert variant="destructive">
        <AlertTitle>{t.projects.notFound}</AlertTitle>
        <AlertDescription>
          <Button variant="outline" size="sm" onClick={() => void project.refetch()}>
            {t.projects.retry}
          </Button>
        </AlertDescription>
      </Alert>
    )
  return <ProjectView project={project.data} />
}

function ProjectView({ project }: { project: Project }) {
  const t = useT()
  const router = useRouter()
  const navigate = useNavigate({ from: Route.fullPath })
  const { new: creating = false, tab = 'architectures', step, generation } = Route.useSearch()
  const [editing, setEditing] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const [query, setQuery] = React.useState('')
  React.useEffect(() => {
    const id = setTimeout(() => {
      setQuery(search.trim())
    }, 250)
    return () => {
      clearTimeout(id)
    }
  }, [search])
  const architectures = useArchitectures(project.id, query)
  const setCreating = (open: boolean) =>
    void navigate({ search: open ? { new: true } : {}, replace: true })
  const setTab = (next: string) =>
    void navigate({ search: next === 'agents' ? { tab: 'agents' } : {}, replace: true })
  const setAgentView = (view: AgentConfigView) =>
    void navigate({ search: { tab: 'agents', ...view } })

  return (
    <>
      <PageHeader
        title={project.name}
        description={project.description ?? t.architectures.description}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setEditing(true)
              }}
            >
              <PencilIcon /> {t.projects.rename}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setDeleting(true)
              }}
            >
              <Trash2Icon /> {t.projects.delete}
            </Button>
            <Button
              onClick={() => {
                setCreating(true)
              }}
            >
              <PlusIcon /> {t.architectures.new}
            </Button>
          </>
        }
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line">
          <TabsTrigger value="architectures">{t.agents.tabArchitectures}</TabsTrigger>
          <TabsTrigger value="agents">
            {t.agents.tab}
            <AgentConfigBadge project={project} />
          </TabsTrigger>
        </TabsList>
        <TabsContent value="architectures" className="flex flex-col gap-4">
          <Input
            type="search"
            className="sm:w-72"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
            }}
            placeholder={t.architectures.search}
            aria-label={t.architectures.search}
          />
          <ArchitectureList
            query={architectures}
            searching={query !== ''}
            emptyDescription={t.architectures.emptyDescription}
            onCreate={() => {
              setCreating(true)
            }}
          />
        </TabsContent>
        <TabsContent value="agents">
          <ProjectAgentConfig
            project={project}
            view={{ step, generation }}
            onViewChange={setAgentView}
          />
        </TabsContent>
      </Tabs>
      <CreateArchitectureDialog projectId={project.id} open={creating} onOpenChange={setCreating} />
      <EditProjectDialog
        project={project}
        open={editing}
        onOpenChange={setEditing}
        // The breadcrumbs read the name through the route loader.
        onSaved={() => void router.invalidate()}
      />
      <DeleteProjectDialog
        project={project}
        open={deleting}
        onOpenChange={setDeleting}
        onDeleted={() => void navigate({ to: '/projects', replace: true })}
      />
    </>
  )
}

/** The project's configuration (at most one), or the setup that creates one in it. */
function ProjectAgentConfig({
  project,
  view,
  onViewChange,
}: {
  project: Project
  view: AgentConfigView
  onViewChange: (view: AgentConfigView) => void
}) {
  const t = useT()
  const configs = useAgentConfigs({ projectId: project.id })
  if (configs.isPending) return <Skeleton className="h-64 w-full" />
  if (configs.isError)
    return (
      <Alert variant="destructive">
        <AlertTitle>{t.agents.loadFailed}</AlertTitle>
        <AlertDescription>
          <Button variant="outline" size="sm" onClick={() => void configs.refetch()}>
            {t.agents.retry}
          </Button>
        </AlertDescription>
      </Alert>
    )
  const config = configs.data.data.at(0)
  if (!config)
    return (
      <AgentConfigSetup
        projectId={project.id}
        defaultName={project.name}
        onCreated={() => {
          onViewChange({ step: 'questions' })
        }}
      />
    )
  return (
    <AgentConfigTab
      configId={config.id}
      view={view}
      onViewChange={onViewChange}
      onDeleted={() => {
        onViewChange({})
      }}
    />
  )
}

/** "Needs regenerating" next to the tab's name, in words, when the latest files are stale. */
function AgentConfigBadge({ project }: { project: Project }) {
  const configs = useAgentConfigs({ projectId: project.id })
  const config = configs.data?.data.at(0)
  if (project.agentConfigCount === 0 || !config) return null
  return <StaleBadge configId={config.id} />
}

function StaleBadge({ configId }: { configId: number }) {
  const t = useT()
  const config = useAgentConfig(configId)
  if (!config.data?.impact?.stale) return null
  return <Badge variant="warning">{t.agents.stale}</Badge>
}
