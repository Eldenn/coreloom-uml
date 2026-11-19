// The rules a web research proposed, kept in a message of the conversation: the pages read and,
// until the owner is done with them, the same review as the import panel. Rules are added with the
// agent conventions' own routes; the message only records how many were.
import * as React from 'react'

import { ImportReview, ResearchSources } from '@/agent-configs/import-review'
import { groupsBySlot, type ImportResult, safeReadyKeys } from '@/agent-configs/import-rules'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/sonner'
import { Spinner } from '@/components/ui/spinner'
import { type AgentConfig, type RulePack, useAgentConfig, useRulePacks } from '@/lib/agent-configs'
import { type MessageProposals as Proposals, useSettleProposals } from '@/lib/assistant'
import { TuyauError } from '@/lib/client'
import { useT } from '@/lib/locale'

interface Props {
  conversationId: number
  messageId: number
  proposals: Proposals
}

export function MessageProposals(props: Props) {
  const t = useT().assistant
  const { proposals } = props
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-3">
      <ResearchSources sources={proposals.sources} />
      {proposals.status === 'settled' ? (
        <p className="m-0 text-[13px] text-muted-foreground">
          {t.proposalsSettled(proposals.added ?? 0)}
        </p>
      ) : (
        <PendingProposals {...props} />
      )}
    </div>
  )
}

/** Reads the conventions the rules are for, and the catalog they are checked against. */
function PendingProposals(props: Props) {
  const t = useT().assistant
  const config = useAgentConfig(props.proposals.agentConfigId)
  const packs = useRulePacks()
  if (config.isError || packs.isError) {
    const gone = config.error instanceof TuyauError && config.error.status === 404
    return (
      <p className="m-0 text-[13px] text-muted-foreground">
        {gone ? t.conventionsGone : t.actionFailed}
      </p>
    )
  }
  if (!config.data || !packs.data)
    return (
      <p role="status" className="m-0 flex items-center gap-2 text-[13px] text-muted-foreground">
        <Spinner /> {t.proposalsLoading}
      </p>
    )
  return <ProposalsToReview {...props} config={config.data.config} packs={packs.data} />
}

function ProposalsToReview({
  conversationId,
  messageId,
  proposals,
  config,
  packs,
}: Props & { config: AgentConfig; packs: RulePack[] }) {
  const t = useT().assistant
  const groups = React.useMemo(() => groupsBySlot(packs), [packs])
  // ponytail: what is left and how many were added live in this screen only, so a page reloaded
  // before "Done" shows every proposal again; store the handled ones in the message if that hurts.
  const [left, setLeft] = React.useState<ImportResult | null>(() => ({
    ready: proposals.ready,
    rules: proposals.rules.map((rule, index) => ({ ...rule, id: String(index), basedOn: null })),
    truncated: proposals.truncated,
    // Shown above, settled or not.
    sources: null,
  }))
  const [checked, setChecked] = React.useState(() => safeReadyKeys(config, groups, proposals.ready))
  const [added, setAdded] = React.useState(0)
  const settle = useSettleProposals(conversationId)
  const { mutate, isIdle } = settle
  const handled = left !== null && left.ready.length + left.rules.length === 0

  // Every proposal was answered and at least one rule added: nothing is left to say "Done" about.
  React.useEffect(() => {
    if (handled && added > 0 && isIdle) mutate({ messageId, added })
  }, [handled, added, isIdle, mutate, messageId])

  if (!left) return null
  return (
    <>
      <ImportReview
        configId={proposals.agentConfigId}
        config={config}
        groups={groups}
        result={left}
        checked={checked}
        onCheckedChange={setChecked}
        onResultChange={setLeft}
        onAdded={(count) => {
          setAdded((n) => n + count)
        }}
      />
      <Button
        size="sm"
        variant="outline"
        className="w-fit"
        disabled={settle.isPending}
        onClick={() => {
          mutate(
            { messageId, added },
            {
              onError: (error) => {
                // Already settled (in another tab): the conversation read again says so.
                if (!(error instanceof TuyauError && error.status === 409))
                  toast.error(t.actionFailed)
              },
            },
          )
        }}
      >
        {t.proposalsDone}
      </Button>
    </>
  )
}
