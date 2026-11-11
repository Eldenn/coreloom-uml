// One configuration, on its own page or in its project's "Agent conventions" tab: the
// questionnaire (`?step=questions`), a generation (`?generation=<id>`) or the summary.
import { AgentConfigGeneration } from '@/agent-configs/agent-config-generation'
import { AgentConfigQuestions } from '@/agent-configs/agent-config-questions'
import { AgentConfigSummary } from '@/agent-configs/agent-config-summary'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAgentConfig, useConfigQuestionnaires } from '@/lib/agent-configs'
import { useT } from '@/lib/locale'

export interface AgentConfigView {
  step?: 'questions'
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
  const ids = config.data?.config.questionnaires.map((q) => q.id) ?? []
  const questionnaires = useConfigQuestionnaires(ids)

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
  if (questionnaires.isError) return <LoadFailed onRetry={() => void questionnaires.refetch()} />
  if (!questionnaires.data) return <Skeleton className="h-64 w-full" />
  if (view.step === 'questions')
    return (
      <AgentConfigQuestions
        configId={configId}
        config={config.data.config}
        questionnaires={questionnaires.data}
        onDone={() => {
          onViewChange({})
        }}
      />
    )
  return (
    <AgentConfigSummary
      configId={configId}
      config={config.data.config}
      impact={config.data.impact}
      questionnaires={questionnaires.data}
      onEditAnswers={() => {
        onViewChange({ step: 'questions' })
      }}
      onShowGeneration={(generation) => {
        onViewChange({ generation })
      }}
      onDeleted={onDeleted}
    />
  )
}
