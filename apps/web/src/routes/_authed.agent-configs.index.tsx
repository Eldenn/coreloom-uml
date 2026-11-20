// Every agent conventions configuration of the account, in a project or on its own.
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { MergeIcon, PlusIcon } from 'lucide-react'
import * as React from 'react'
import { z } from 'zod'

import { AgentConfigList, CreateAgentConfigDialog } from '@/agent-configs/agent-config-list'
import { MergeAgentConfigsDialog } from '@/agent-configs/merge-agent-configs'
import { PageHeader } from '@/components/app-shell'
import { ActionBar } from '@/components/ui/action-bar'
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
  const [merging, setMerging] = React.useState(false)
  /** The rows ticked, by id with their name: they stay ticked while a search hides them. */
  const [selected, setSelected] = React.useState<ReadonlyMap<number, string>>(() => new Map())
  const sources = [...selected].map(([id, name]) => ({ id, name }))
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
          selection={{
            has: (id) => selected.has(id),
            onToggle: (config, on) => {
              setSelected((current) => {
                const next = new Map(current)
                if (on) next.set(config.id, config.name)
                else next.delete(config.id)
                return next
              })
            },
          }}
        />
      </div>
      <CreateAgentConfigDialog open={creating} onOpenChange={setCreating} />
      <ActionBar
        count={selected.size}
        label={selected.size === 1 ? t.agents.mergePickMore : undefined}
        onClear={() => {
          setSelected(new Map())
        }}
      >
        <Button
          size="sm"
          variant="secondary"
          disabled={selected.size < 2}
          onClick={() => {
            setMerging(true)
          }}
        >
          <MergeIcon /> {t.agents.merge}
        </Button>
      </ActionBar>
      <MergeAgentConfigsDialog
        open={merging}
        onOpenChange={setMerging}
        sources={sources}
        onMerged={() => {
          setSelected(new Map())
        }}
      />
    </>
  )
}
