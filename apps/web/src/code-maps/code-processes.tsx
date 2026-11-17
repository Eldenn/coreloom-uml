// The processes no diagram documents: from each entry point, the calls followed a few levels
// down that touch no code linked to a diagram. Largest first; each opens to show the calls, and
// the user's own model can draw one as a new view, proposed in an architecture's assistant.
import { Link, useNavigate } from '@tanstack/react-router'
import { SparklesIcon, WorkflowIcon } from 'lucide-react'
import * as React from 'react'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { useArchitectures } from '@/lib/architectures'
import {
  codeHref,
  type CodeMapDetail,
  type CodeMapProcess,
  PROCESS_DIAGRAM_KINDS,
  type ProcessDiagramKind,
  splitCodeKey,
  useCodeMapProcesses,
  useProposeProcess,
} from '@/lib/code-maps'
import { useFeature } from '@/lib/feature-flags'
import { useCoreloomI18n } from '@/lib/i18n'
import { providerCallFailure, useStoredProvider } from '@/lib/llm-provider'
import { useLocale, useT } from '@/lib/locale'
import { useProviderFailureText } from '@/llm/provider-failure'

export function CodeProcesses({
  map,
  onShowSuggestions,
}: {
  map: CodeMapDetail
  onShowSuggestions: () => void
}) {
  const t = useT()
  const processes = useCodeMapProcesses(map.id)
  if (processes.isPending) return <Skeleton className="h-64 w-full" />
  if (processes.isError)
    return (
      <Alert variant="destructive">
        <AlertTitle>{t.code.processesFailed}</AlertTitle>
        <AlertDescription>
          <Button variant="outline" size="sm" onClick={() => void processes.refetch()}>
            {t.code.retry}
          </Button>
        </AlertDescription>
      </Alert>
    )
  const { total, processes: list } = processes.data
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.code.viewProcesses}</CardTitle>
        <CardDescription>{t.code.processesHint}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {map.summary?.entries.length === 0 && (
          <div className="flex flex-col items-start gap-3">
            <p className="m-0 text-[13px] text-muted-foreground">{t.code.processesNoEntries}</p>
            <Button variant="outline" size="sm" onClick={onShowSuggestions}>
              <SparklesIcon /> {t.code.processesSeeSuggestions}
            </Button>
          </div>
        )}
        {map.summary?.entries.length !== 0 && total === 0 && (
          <p className="m-0 text-[13px] text-muted-foreground">{t.code.noProcesses}</p>
        )}
        {total > 0 && (
          <>
            <p className="m-0 text-[13px] text-fg-secondary">
              {t.code.processesCount(list.length, total)}
            </p>
            <Accordion type="multiple" className="rounded-md border">
              {list.map((process) => (
                <ProcessItem key={process.entry} map={map} process={process} />
              ))}
            </Accordion>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function ProcessItem({ map, process }: { map: CodeMapDetail; process: CodeMapProcess }) {
  const t = useT()
  const assistant = useFeature('diagram-assistant')
  const [proposing, setProposing] = React.useState(false)
  const entry = splitCodeKey(process.entry)
  return (
    <AccordionItem value={process.entry} className="px-4">
      <AccordionTrigger>
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <WorkflowIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <Badge variant="secondary">{t.code.entryKinds[process.entryKind]}</Badge>
          <span className="min-w-0 font-mono text-[13px] break-all">
            {entry.name ?? entry.path}
          </span>
          <span className="text-[12.5px] font-normal text-muted-foreground">
            {t.code.processSize(process.size)} · {t.code.processDepth(process.depth)}
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <p className="m-0 font-mono text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            {t.code.processFolders}
          </p>
          <p className="m-0 font-mono text-[12.5px] break-all">{process.folders.join(', ')}</p>
        </div>
        <div className="flex flex-col gap-1">
          <p className="m-0 font-mono text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            {t.code.processCalls}
          </p>
          <ol className="m-0 flex flex-col gap-1 pl-5 font-mono text-[12.5px]">
            {process.nodes.map((key) => {
              const href = codeHref(map, key)
              return (
                <li key={key} className="break-all">
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-primary-text underline-offset-2 hover:underline"
                    >
                      {key}
                    </a>
                  ) : (
                    key
                  )}
                </li>
              )
            })}
          </ol>
        </div>
        {assistant && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => {
                setProposing(true)
              }}
            >
              <SparklesIcon /> {t.code.proposeDiagram}
            </Button>
            <ProposeProcessDialog
              open={proposing}
              onOpenChange={setProposing}
              map={map}
              process={process}
            />
          </>
        )}
      </AccordionContent>
    </AccordionItem>
  )
}

/**
 * Picks the architecture the new view goes to and its kind (sequence by default), then has the
 * user's model draw it. The proposal opens in that architecture's assistant, to accept or reject.
 */
function ProposeProcessDialog({
  open,
  onOpenChange,
  map,
  process,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  map: CodeMapDetail
  process: CodeMapProcess
}) {
  const t = useT()
  const { locale } = useLocale()
  const provider = useStoredProvider()
  const failureText = useProviderFailureText()
  const navigate = useNavigate()
  const architectures = useArchitectures(map.projectId, '')
  const propose = useProposeProcess(map.id)
  const list = architectures.data?.data ?? []
  const [chosen, setChosen] = React.useState<number | null>(null)
  const architectureId = chosen ?? list.at(0)?.id ?? null
  const [kind, setKind] = React.useState<ProcessDiagramKind>('sequence')
  const entry = splitCodeKey(process.entry)
  const name = entry.name ?? entry.path

  const submit = () => {
    if (!provider || architectureId === null) return
    propose.mutate(
      {
        provider,
        entry: process.entry,
        architectureId,
        kind,
        locale: locale === 'fr' ? 'fr' : 'en',
      },
      {
        onSuccess: (result) => {
          onOpenChange(false)
          void navigate({
            to: '/architectures/$id',
            params: { id: result.architectureId },
            search: { assistant: result.conversation.id },
          })
        },
      },
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!propose.isPending) onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t.code.proposeTitle}</DialogTitle>
          <DialogDescription>
            {provider ? t.code.proposeText(name, provider.model) : t.code.proposeNoProvider}
          </DialogDescription>
        </DialogHeader>
        {provider ? (
          <ProposeFields
            architectures={architectures.isPending ? null : list}
            architectureId={architectureId}
            onArchitectureChange={setChosen}
            kind={kind}
            onKindChange={setKind}
            disabled={propose.isPending}
          />
        ) : (
          <Button variant="outline" asChild className="self-start">
            <Link to="/settings">{t.code.reviewOpenSettings}</Link>
          </Button>
        )}
        {propose.isError && (
          <Alert variant="destructive">
            <AlertTitle>{t.code.proposeFailed}</AlertTitle>
            <AlertDescription>{failureText(providerCallFailure(propose.error))}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={propose.isPending}
            onClick={() => {
              onOpenChange(false)
            }}
          >
            {t.code.cancel}
          </Button>
          <Button
            disabled={!provider || architectureId === null || propose.isPending}
            onClick={submit}
          >
            {propose.isPending ? <Spinner /> : <SparklesIcon />}
            {propose.isPending ? t.code.proposing : t.code.proposeRun}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** The architecture the view goes to and its kind; `architectures` is null while loading. */
function ProposeFields({
  architectures,
  architectureId,
  onArchitectureChange,
  kind,
  onKindChange,
  disabled,
}: {
  architectures: { id: number; title: string }[] | null
  architectureId: number | null
  onArchitectureChange: (id: number) => void
  kind: ProcessDiagramKind
  onKindChange: (kind: ProcessDiagramKind) => void
  disabled: boolean
}) {
  const t = useT()
  const kinds = useCoreloomI18n().messages.diagram.kinds
  if (architectures === null) return <Skeleton className="h-24 w-full" />
  if (architectures.length === 0)
    return <p className="m-0 text-[13px] text-muted-foreground">{t.code.proposeNoArchitecture}</p>
  return (
    <div className="flex flex-col gap-5">
      <ArchitectureField
        architectures={architectures}
        architectureId={architectureId}
        onChange={onArchitectureChange}
        disabled={disabled}
      />
      <FieldSet>
        <FieldLegend variant="label">{t.code.proposeKind}</FieldLegend>
        <RadioGroup
          value={kind}
          onValueChange={(value) => {
            onKindChange(value as ProcessDiagramKind)
          }}
          disabled={disabled}
        >
          {PROCESS_DIAGRAM_KINDS.map((option) => (
            <Field key={option} orientation="horizontal">
              <RadioGroupItem value={option} id={`propose-kind-${option}`} />
              <FieldLabel htmlFor={`propose-kind-${option}`} className="font-normal">
                {kinds[option]}
              </FieldLabel>
            </Field>
          ))}
        </RadioGroup>
      </FieldSet>
    </div>
  )
}

/** The architecture a new view goes to, among the project's. */
export function ArchitectureField({
  architectures,
  architectureId,
  onChange,
  disabled,
}: {
  architectures: { id: number; title: string }[]
  architectureId: number | null
  onChange: (id: number) => void
  disabled: boolean
}) {
  const t = useT()
  return (
    <Field>
      <FieldLabel htmlFor="propose-architecture">{t.code.proposeArchitecture}</FieldLabel>
      <Select
        value={architectureId === null ? '' : String(architectureId)}
        onValueChange={(value) => {
          onChange(Number(value))
        }}
        disabled={disabled}
      >
        <SelectTrigger id="propose-architecture">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {architectures.map((architecture) => (
            <SelectItem key={architecture.id} value={String(architecture.id)}>
              {architecture.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}
