// One configuration, on its own page or in its project's "Agent conventions" tab: the catalog of
// ready-made rules (`?step=rules`, with `pack` and `group`), a generation (`?generation=<id>`) or
// the summary.
import { AgentConfigGeneration } from '@/agent-configs/agent-config-generation'
import { AgentConfigLibrary } from '@/agent-configs/agent-config-library'
import { AgentConfigSummary } from '@/agent-configs/agent-config-summary'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAgentConfig, useRulePacks } from '@/lib/agent-configs'
import { useT } from '@/lib/locale'

export interface AgentConfigView {
  step?: 'rules'
  /** In the catalog: the pack shown, all of them without it. */
  pack?: string
  /** In the catalog: the slot of the group to land on. */
  group?: string
  generation?: number
}

function LoadFailed({ onRetry }: { onRetry: () => void }) {
  const t = useT()
  return (
    <Alert variant="destructive">
      <AlertTitle>{t.agents.loadFailed}</AlertTitle>
      <AlertDescription>
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t.agents.retry}
        </Button>
      </AlertDescription>
    </Alert>
  )
}

export function AgentConfigTab({
  configId,
  view,
  onViewChange,
  onDeleted,
}: {
  configId: number
  view: AgentConfigView
  onViewChange: (view: AgentConfigView) => void
  onDeleted: () => void
}) {
  const config = useAgentConfig(configId)
  const packs = useRulePacks()

  if (config.isPending) return <Skeleton className="h-64 w-full" />
  if (config.isError) return <LoadFailed onRetry={() => void config.refetch()} />
  if (view.generation !== undefined)
    return (
      <AgentConfigGeneration
        configId={configId}
        generationId={view.generation}
        onBack={() => {
          onViewChange({})
        }}
        onSelect={(generation) => {
          onViewChange({ generation })
        }}
      />
    )
  if (packs.isError) return <LoadFailed onRetry={() => void packs.refetch()} />
  if (!packs.data) return <Skeleton className="h-64 w-full" />
  if (view.step === 'rules')
    return (
      <AgentConfigLibrary
        configId={configId}
        config={config.data.config}
        packs={packs.data}
        view={{ pack: view.pack, group: view.group }}
        onViewChange={(library) => {
          onViewChange({ step: 'rules', ...library })
        }}
        onBack={() => {
          onViewChange({})
        }}
      />
    )
  return (
    <AgentConfigSummary
      configId={configId}
      config={config.data.config}
      impact={config.data.impact}
      packs={packs.data}
      onBrowse={(group) => {
        onViewChange({ step: 'rules', group })
      }}
      onShowGeneration={(generation) => {
        onViewChange({ generation })
      }}
      onDeleted={onDeleted}
    />
  )
}
