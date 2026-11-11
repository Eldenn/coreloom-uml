// Every agent conventions configuration of the account, in a project or on its own.
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { PlusIcon } from 'lucide-react'
import * as React from 'react'
import { z } from 'zod'

import { AgentConfigList, CreateAgentConfigDialog } from '@/agent-configs/agent-config-list'
import { PageHeader } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAgentConfigs } from '@/lib/agent-configs'
import { useT } from '@/lib/locale'
import { useProjects } from '@/lib/projects'

export const Route = createFileRoute('/_authed/agent-configs/')({
  // `?new=true` opens the "New agent conventions" dialog (the ⌘K action links here).
  validateSearch: z.object({ new: z.boolean().optional().catch(undefined) }),
  staticData: { crumb: (t) => t.nav.agentConfigs },
  component: AgentConfigsPage,
})

function AgentConfigsPage() {
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
  const configs = useAgentConfigs({ search: query })
  const projects = useProjects()
  const setCreating = (open: boolean) =>
    void navigate({ search: open ? { new: true } : {}, replace: true })

  return (
    <>
      <PageHeader
        title={t.nav.agentConfigs}
        description={t.agents.allDescription}
        actions={
          <Button
            onClick={() => {
              setCreating(true)
            }}
          >
            <PlusIcon /> {t.agents.new}
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
          placeholder={t.agents.search}
          aria-label={t.agents.search}
        />
        <AgentConfigList
          query={configs}
          searching={query !== ''}
          projects={projects.data?.data ?? []}
          onCreate={() => {
            setCreating(true)
          }}
        />
      </div>
      <CreateAgentConfigDialog open={creating} onOpenChange={setCreating} />
    </>
  )
}
