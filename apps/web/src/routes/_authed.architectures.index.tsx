// Every architecture of the account, in a project or on its own; new ones need no project.
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { PlusIcon } from 'lucide-react'
import * as React from 'react'
import { z } from 'zod'

import { ArchitectureList, CreateArchitectureDialog } from '@/architectures/architecture-list'
import { PageHeader } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useArchitectures } from '@/lib/architectures'
import { useT } from '@/lib/locale'
import { useProjects } from '@/lib/projects'

export const Route = createFileRoute('/_authed/architectures/')({
  // `?new=true` opens the "New architecture" dialog (the ⌘K action links here).
  validateSearch: z.object({ new: z.boolean().optional().catch(undefined) }),
  staticData: { crumb: (t) => t.nav.architectures },
  component: ArchitecturesPage,
})

function ArchitecturesPage() {
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
  const architectures = useArchitectures(undefined, query)
  const projects = useProjects()
  const setCreating = (open: boolean) =>
    void navigate({ search: open ? { new: true } : {}, replace: true })

  return (
    <>
      <PageHeader
        title={t.architectures.title}
        description={t.architectures.allDescription}
        actions={
          <Button
            onClick={() => {
              setCreating(true)
            }}
          >
            <PlusIcon /> {t.architectures.new}
          </Button>
        }
      />
      <div className="flex flex-col gap-4">
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
          emptyDescription={t.architectures.allEmptyDescription}
          projects={projects.data?.data ?? []}
          onCreate={() => {
            setCreating(true)
          }}
        />
      </div>
      <CreateArchitectureDialog open={creating} onOpenChange={setCreating} />
    </>
  )
}
