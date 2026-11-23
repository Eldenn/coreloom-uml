// The decisions coding agents proposed through the MCP tool `propose_decision`, waiting for the
// owner's review: kept, one becomes the owner's and counts; dismissed, it is deleted. Until then
// the API leaves them out of everything a model or an agent reads.
import { CheckIcon, XIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/components/ui/item'
import { Popconfirm } from '@/components/ui/popconfirm'
import { toast } from '@/components/ui/sonner'
import { getErrorMessage } from '@/lib/client'
import { type Decision, useDeleteDecision, useKeepDecision } from '@/lib/design-records'
import { useT } from '@/lib/locale'

export function AgentProposals({
  projectId,
  proposals,
  decisions,
  onReviewed,
}: {
  projectId: number
  /** The waiting ones only. */
  proposals: Decision[]
  /** Every decision of the project, to name the one a proposal would replace. */
  decisions: Decision[]
  /** After one is kept or dismissed: its row is gone, focus goes elsewhere. */
  onReviewed: () => void
}) {
  const t = useT()
  if (proposals.length === 0) return null
  const titles = new Map(decisions.map((decision) => [decision.id, decision.title]))
  return (
    <Card>
      <CardHeader>
        <CardTitle id="design-agent-proposals-title">{t.design.agentProposals}</CardTitle>
        <CardDescription>{t.design.agentProposalsDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <ItemGroup aria-labelledby="design-agent-proposals-title" className="gap-2">
          {proposals.map((proposal) => (
            <Proposal
              key={proposal.id}
              projectId={projectId}
              proposal={proposal}
              onReviewed={onReviewed}
              replaces={
                proposal.supersedesId === null ? null : (titles.get(proposal.supersedesId) ?? null)
              }
            />
          ))}
        </ItemGroup>
      </CardContent>
    </Card>
  )
}

function Proposal({
  projectId,
  proposal,
  replaces,
  onReviewed,
}: {
  projectId: number
  proposal: Decision
  replaces: string | null
  onReviewed: () => void
}) {
  const t = useT()
  const keep = useKeepDecision(projectId)
  const dismiss = useDeleteDecision(projectId)
  return (
    <Item variant="outline" size="sm" className="items-start">
      <ItemContent className="min-w-0 gap-1.5">
        <ItemTitle className="flex flex-wrap items-center gap-2">
          {proposal.title}
          <Badge variant="outline">{t.design.fromAgent}</Badge>
        </ItemTitle>
        {replaces && (
          <p className="m-0 text-sm text-foreground">{t.design.wouldReplace(replaces)}</p>
        )}
        {proposal.context && (
          <ItemDescription className="line-clamp-3">{proposal.context}</ItemDescription>
        )}
        <p className="m-0 text-sm text-foreground">
          {proposal.chosen === null ? t.design.notChosen : t.design.chosenValue(proposal.chosen)}
          <span className="text-muted-foreground">
            {' · '}
            {proposal.options.map((option) => option.name).join(', ')}
          </span>
        </p>
        {proposal.consequences && (
          <ItemDescription className="line-clamp-2">{proposal.consequences}</ItemDescription>
        )}
      </ItemContent>
      <ItemActions>
        <Button
          variant="outline"
          size="sm"
          aria-label={t.design.keepItem(proposal.title)}
          disabled={keep.isPending}
          onClick={() => {
            keep.mutate(proposal.id, {
              onSuccess: () => {
                toast.success(t.design.proposalKept)
                onReviewed()
              },
              onError: (error) => toast.error(getErrorMessage(error, t.design.failed)),
            })
          }}
        >
          <CheckIcon /> {t.design.keep}
        </Button>
        <Popconfirm
          title={t.design.dismissItem(proposal.title)}
          description={t.design.dismissText}
          confirmLabel={t.design.dismiss}
          cancelLabel={t.design.cancel}
          destructive
          align="end"
          onConfirm={async () => {
            try {
              await dismiss.mutateAsync(proposal.id)
              toast.success(t.design.proposalDismissed)
              onReviewed()
            } catch (error) {
              toast.error(getErrorMessage(error, t.design.failed))
            }
          }}
        >
          <Button variant="ghost" size="sm" aria-label={t.design.dismissItem(proposal.title)}>
            <XIcon /> {t.design.dismiss}
          </Button>
        </Popconfirm>
      </ItemActions>
    </Item>
  )
}
