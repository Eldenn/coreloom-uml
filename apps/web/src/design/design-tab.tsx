// A project's Design tab (behind the `design-records` flag): what its architecture has to hold,
// and the decisions taken to hold it. The assistant reads both before it draws.
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import * as React from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/components/ui/item'
import { Popconfirm } from '@/components/ui/popconfirm'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/sonner'
import { AgentProposals } from '@/design/agent-proposals'
import { DecisionForm, RequirementForm } from '@/design/design-forms'
import { DesignReview } from '@/design/design-review'
import { getErrorMessage } from '@/lib/client'
import {
  awaitsReview,
  type Decision,
  type Requirement,
  useDecisions,
  useDeleteDecision,
  useDeleteRequirement,
  useRequirements,
} from '@/lib/design-records'
import { useT } from '@/lib/locale'
import { useProjectDiagrams } from '@/lib/project-diagrams'

/** The dialog's subject: a new one, or the one being changed; null while closed. */
type Draft<T> = { item?: T } | null

const STATUS_VARIANT = {
  proposed: 'warning',
  accepted: 'success',
  superseded: 'secondary',
} as const

export function DesignTab({ projectId }: { projectId: number }) {
  const t = useT()
  const requirements = useRequirements(projectId)
  const decisions = useDecisions(projectId)
  const { diagrams } = useProjectDiagrams(projectId)
  const [requirement, setRequirement] = React.useState<Draft<Requirement>>(null)
  const [decision, setDecision] = React.useState<Draft<Decision>>(null)
  const addRequirementRef = React.useRef<HTMLButtonElement>(null)
  const addDecisionRef = React.useRef<HTMLButtonElement>(null)

  if (requirements.isPending || decisions.isPending) return <Skeleton className="h-64 w-full" />
  if (requirements.isError || decisions.isError)
    return (
      <Alert variant="destructive">
        <AlertTitle>{t.design.loadFailed}</AlertTitle>
        <AlertDescription>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void requirements.refetch()
              void decisions.refetch()
            }}
          >
            {t.design.retry}
          </Button>
        </AlertDescription>
      </Alert>
    )

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 max-w-prose text-sm text-muted-foreground">{t.design.intro}</p>
      <DesignReview projectId={projectId} />
      <Section
        id="design-requirements-title"
        title={t.design.requirements}
        description={t.design.requirementsDescription}
        addLabel={t.design.addRequirement}
        emptyLabel={t.design.noRequirement}
        addRef={addRequirementRef}
        onAdd={() => {
          setRequirement({})
        }}
      >
        {requirements.data.map((item) => (
          <RequirementItem
            key={item.id}
            projectId={projectId}
            requirement={item}
            onEdit={() => {
              setRequirement({ item })
            }}
            onDeleted={() => addRequirementRef.current?.focus()}
          />
        ))}
      </Section>
      <AgentProposals
        projectId={projectId}
        proposals={decisions.data.filter(awaitsReview)}
        decisions={decisions.data}
        onReviewed={() => addDecisionRef.current?.focus()}
      />
      <Section
        id="design-decisions-title"
        title={t.design.decisions}
        description={t.design.decisionsDescription}
        addLabel={t.design.addDecision}
        emptyLabel={t.design.noDecision}
        addRef={addDecisionRef}
        onAdd={() => {
          setDecision({})
        }}
      >
        {decisions.data
          .filter((item) => !awaitsReview(item))
          .map((item) => (
            <DecisionItem
              key={item.id}
              projectId={projectId}
              decision={item}
              onEdit={() => {
                setDecision({ item })
              }}
              onDeleted={() => addDecisionRef.current?.focus()}
            />
          ))}
      </Section>

      <Dialog
        open={requirement !== null}
        onOpenChange={(open) => {
          if (!open) setRequirement(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {requirement?.item ? t.design.editRequirement : t.design.newRequirement}
            </DialogTitle>
          </DialogHeader>
          {requirement && (
            <RequirementForm
              projectId={projectId}
              requirement={requirement.item}
              onDone={() => {
                setRequirement(null)
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={decision !== null}
        onOpenChange={(open) => {
          if (!open) setDecision(null)
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {decision?.item ? t.design.editDecision : t.design.newDecision}
            </DialogTitle>
          </DialogHeader>
          {decision && (
            <DecisionForm
              projectId={projectId}
              decision={decision.item}
              decisions={decisions.data}
              requirements={requirements.data}
              diagrams={diagrams}
              onDone={() => {
                setDecision(null)
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** One of the tab's two lists: its title, what it holds, the button that adds to it. */
function Section({
  id,
  title,
  description,
  addLabel,
  emptyLabel,
  addRef,
  onAdd,
  children,
}: {
  id: string
  title: string
  description: string
  addLabel: string
  emptyLabel: string
  addRef: React.Ref<HTMLButtonElement>
  onAdd: () => void
  children: React.ReactNode[]
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle id={id}>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        <CardAction>
          <Button ref={addRef} variant="outline" size="sm" onClick={onAdd}>
            <PlusIcon /> {addLabel}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {children.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{emptyLabel}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <ItemGroup aria-labelledby={id} className="gap-2">
            {children}
          </ItemGroup>
        )}
      </CardContent>
    </Card>
  )
}

interface ItemProps {
  projectId: number
  onEdit: () => void
  onDeleted: () => void
}

function RequirementItem({
  projectId,
  requirement,
  onEdit,
  onDeleted,
}: ItemProps & { requirement: Requirement }) {
  const t = useT()
  const remove = useDeleteRequirement(projectId)
  return (
    <Item variant="outline" size="sm" className="items-start">
      <ItemContent className="min-w-0 gap-1.5">
        <ItemTitle className="flex flex-wrap items-center gap-2 font-normal">
          <Badge variant={requirement.priority === 'must' ? 'default' : 'secondary'}>
            {t.design.priorities[requirement.priority]}
          </Badge>
          <Badge variant="outline">{t.design.categories[requirement.category]}</Badge>
        </ItemTitle>
        <p className="m-0 text-sm text-foreground">{requirement.statement}</p>
        {requirement.measure && (
          <ItemDescription>
            {t.design.measure}: {requirement.measure}
          </ItemDescription>
        )}
      </ItemContent>
      <RowActions
        name={requirement.statement}
        deleteText={t.design.deleteRequirementText}
        onEdit={onEdit}
        onDelete={async () => {
          await remove.mutateAsync(requirement.id)
          toast.success(t.design.requirementDeleted)
          onDeleted()
        }}
      />
    </Item>
  )
}

function DecisionItem({
  projectId,
  decision,
  onEdit,
  onDeleted,
}: ItemProps & { decision: Decision }) {
  const t = useT()
  const remove = useDeleteDecision(projectId)
  const links = [
    decision.requirementIds.length > 0 && t.design.serves(decision.requirementIds.length),
    decision.diagramIds.length > 0 && t.design.shapes(decision.diagramIds.length),
  ].filter(Boolean)
  return (
    <Item variant="outline" size="sm" className="items-start">
      <ItemContent className="min-w-0 gap-1.5">
        <ItemTitle className="flex flex-wrap items-center gap-2">
          {decision.title}
          <Badge variant={STATUS_VARIANT[decision.status]}>
            {t.design.statuses[decision.status]}
          </Badge>
        </ItemTitle>
        <p className="m-0 text-sm text-foreground">
          {decision.chosen === null ? t.design.notChosen : t.design.chosenValue(decision.chosen)}
          <span className="text-muted-foreground">
            {' · '}
            {decision.options.map((option) => option.name).join(', ')}
          </span>
        </p>
        {decision.consequences && (
          <ItemDescription className="line-clamp-2">{decision.consequences}</ItemDescription>
        )}
        {links.length > 0 && (
          <p className="m-0 text-[13px] text-muted-foreground">{links.join(' · ')}</p>
        )}
      </ItemContent>
      <RowActions
        name={decision.title}
        deleteText={t.design.deleteDecisionText}
        onEdit={onEdit}
        onDelete={async () => {
          await remove.mutateAsync(decision.id)
          toast.success(t.design.decisionDeleted)
          onDeleted()
        }}
      />
    </Item>
  )
}

function RowActions({
  name,
  deleteText,
  onEdit,
  onDelete,
}: {
  name: string
  deleteText: string
  onEdit: () => void
  onDelete: () => Promise<void>
}) {
  const t = useT()
  return (
    <ItemActions>
      <Button variant="ghost" size="sm" aria-label={t.design.editItem(name)} onClick={onEdit}>
        <PencilIcon /> {t.design.edit}
      </Button>
      <Popconfirm
        title={t.design.deleteItem(name)}
        description={deleteText}
        confirmLabel={t.design.delete}
        cancelLabel={t.design.cancel}
        destructive
        align="end"
        onConfirm={async () => {
          try {
            await onDelete()
          } catch (error) {
            toast.error(getErrorMessage(error, t.design.failed))
          }
        }}
      >
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={t.design.deleteItem(name)}
        >
          <Trash2Icon />
        </Button>
      </Popconfirm>
    </ItemActions>
  )
}
