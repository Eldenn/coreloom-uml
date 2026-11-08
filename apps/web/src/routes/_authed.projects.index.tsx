// The user's projects: each one holds the architectures (and later other artifacts) of a system.
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  FolderIcon,
  FolderOpenIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react'
import * as React from 'react'
import { z } from 'zod'

import { PageHeader } from '@/components/app-shell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item'
import { RelativeTime } from '@/components/ui/relative-time'
import { Skeleton } from '@/components/ui/skeleton'
import { useT } from '@/lib/locale'
import { type Project, useProjects } from '@/lib/projects'
import {
  CreateProjectDialog,
  DeleteProjectDialog,
  EditProjectDialog,
} from '@/projects/project-dialogs'

export const Route = createFileRoute('/_authed/projects/')({
  // `?new=true` opens the "New project" dialog (the ⌘K action links here).
  validateSearch: z.object({ new: z.boolean().optional().catch(undefined) }),
  staticData: { crumb: (t) => t.nav.projects },
  component: ProjectsPage,
})

function ProjectsPage() {
  const t = useT()
  const navigate = useNavigate({ from: Route.fullPath })
  const { new: creating = false } = Route.useSearch()
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
  const projects = useProjects(query)
  const setCreating = (open: boolean) =>
    void navigate({ search: open ? { new: true } : {}, replace: true })

  return (
    <>
      <PageHeader
        title={t.projects.title}
        description={t.projects.description}
        actions={
          <Button
            onClick={() => {
              setCreating(true)
            }}
          >
            <PlusIcon /> {t.projects.new}
          </Button>
        }
      />
      <Input
        type="search"
        className="sm:w-72"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value)
        }}
        placeholder={t.projects.search}
        aria-label={t.projects.search}
      />
      <ProjectList
        query={projects}
        searching={query !== ''}
        onCreate={() => {
          setCreating(true)
        }}
      />
      <CreateProjectDialog open={creating} onOpenChange={setCreating} />
    </>
  )
}

function ProjectList({
  query,
  searching,
  onCreate,
}: {
  query: ReturnType<typeof useProjects>
  searching: boolean
  onCreate: () => void
}) {
  const t = useT()
  if (query.isPending)
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    )
  if (query.isError)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{t.projects.loadFailed}</EmptyTitle>
        </EmptyHeader>
        <Button variant="outline" onClick={() => void query.refetch()}>
          {t.projects.retry}
        </Button>
      </Empty>
    )
  if (query.data.data.length === 0)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FolderIcon />
          </EmptyMedia>
          <EmptyTitle>{t.projects.emptyTitle}</EmptyTitle>
          {!searching && <EmptyDescription>{t.projects.emptyDescription}</EmptyDescription>}
        </EmptyHeader>
        {!searching && (
          <Button onClick={onCreate}>
            <PlusIcon /> {t.projects.new}
          </Button>
        )}
      </Empty>
    )
  return (
    <ItemGroup className="gap-2">
      {query.data.data.map((project) => (
        <ProjectRow key={project.id} project={project} />
      ))}
    </ItemGroup>
  )
}

function ProjectRow({ project }: { project: Project }) {
  const t = useT()
  const navigate = useNavigate()
  const [editing, setEditing] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const open = () =>
    void navigate({ to: '/projects/$projectId', params: { projectId: project.id } })

  return (
    <>
      <Item variant="outline" className="relative">
        <ItemMedia variant="icon">
          <FolderIcon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>
            {/* The whole row opens the project; the menu below stays clickable on top of it. */}
            <Link
              to="/projects/$projectId"
              params={{ projectId: project.id }}
              className="rounded-sm outline-none after:absolute after:inset-0 focus-visible:ring-[3px] focus-visible:ring-ring"
            >
              {project.name}
            </Link>
          </ItemTitle>
          {!!project.description && (
            <ItemDescription className="line-clamp-1">{project.description}</ItemDescription>
          )}
        </ItemContent>
        <ItemActions className="relative">
          {project.agentConfigCount > 0 && (
            <Badge variant="outline" className="hidden sm:inline-flex">
              {t.agents.badge}
            </Badge>
          )}
          <Badge variant="secondary">
            {t.projects.architectureCount(project.architectureCount)}
          </Badge>
          <RelativeTime
            date={project.updatedAt}
            className="hidden text-[13px] text-muted-foreground sm:inline"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t.projects.actions(project.name)}>
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={open}>
                <FolderOpenIcon /> {t.projects.open}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  setEditing(true)
                }}
              >
                <PencilIcon /> {t.projects.rename}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => {
                  setDeleting(true)
                }}
              >
                <Trash2Icon /> {t.projects.delete}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </ItemActions>
      </Item>
      <EditProjectDialog project={project} open={editing} onOpenChange={setEditing} />
      <DeleteProjectDialog project={project} open={deleting} onOpenChange={setDeleting} />
    </>
  )
}
