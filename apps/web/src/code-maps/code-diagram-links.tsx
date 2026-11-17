// One diagram of the project against the code map: the drawing with a status on each element
// (linked, to confirm, not found), the links to confirm, correct or dismiss, the links already
// reviewed, and what the code says that the diagram doesn't. Deterministic: no model is called.
import { CircleAlertIcon, CircleXIcon, TriangleAlertIcon, Undo2Icon } from 'lucide-react'
import * as React from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DataTable, DataTableColumnHeader } from '@/components/ui/data-table'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/sonner'
import { type Suggestion, SuggestionList } from '@/components/ui/suggestion-list'
import { type UmlAnnotation, UmlDiagram } from '@/components/ui/uml-diagram'
import { getErrorMessage } from '@/lib/client'
import {
  type CodeMapDetail,
  type DiagramCodeLink,
  type DiagramMatch,
  type MatchFinding,
  useCodeMapLinks,
  useSaveCodeMapLinks,
} from '@/lib/code-maps'
import { useT } from '@/lib/locale'
import { elementNames, type ProjectDiagram, useProjectDiagrams } from '@/lib/project-diagrams'

export function CodeDiagramLinks({
  projectId,
  map,
  diagramId,
  onDiagramChange,
}: {
  projectId: number
  map: CodeMapDetail
  diagramId: number | undefined
  onDiagramChange: (id: number) => void
}) {
  const t = useT()
  const { pending, failed, diagrams, refetch } = useProjectDiagrams(projectId)
  if (pending) return <Skeleton className="h-96 w-full" />
  if (failed)
    return (
      <Alert variant="destructive">
        <AlertTitle>{t.code.loadFailed}</AlertTitle>
        <AlertDescription>
          <Button variant="outline" size="sm" onClick={refetch}>
            {t.code.retry}
          </Button>
        </AlertDescription>
      </Alert>
    )
  if (diagrams.length === 0)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CircleAlertIcon />
          </EmptyMedia>
          <EmptyTitle>{t.code.noDiagrams}</EmptyTitle>
          <EmptyDescription>{t.code.noDiagramsText}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  const diagram = diagrams.find((item) => item.id === diagramId) ?? diagrams[0]
  return (
    <div className="flex flex-col gap-4">
      <DiagramPicker diagrams={diagrams} value={diagram.id} onChange={onDiagramChange} />
      <DiagramMatchView key={diagram.id} map={map} diagram={diagram} />
    </div>
  )
}

function DiagramPicker({
  diagrams,
  value,
  onChange,
}: {
  diagrams: ProjectDiagram[]
  value: number
  onChange: (id: number) => void
}) {
  const t = useT()
  const id = React.useId()
  const groups = new Map<string, ProjectDiagram[]>()
  for (const diagram of diagrams) {
    groups.set(diagram.architecture, [...(groups.get(diagram.architecture) ?? []), diagram])
  }
  return (
    <div className="flex flex-col gap-2 sm:w-96">
      <Label htmlFor={id}>{t.code.diagram}</Label>
      <Select
        value={String(value)}
        onValueChange={(next) => {
          onChange(Number(next))
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={t.code.pickDiagram} />
        </SelectTrigger>
        <SelectContent>
          {[...groups].map(([architecture, items]) => (
            <SelectGroup key={architecture}>
              <SelectLabel>{architecture}</SelectLabel>
              {items.map((diagram) => (
                <SelectItem key={diagram.id} value={String(diagram.id)}>
                  {diagram.title}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

const ANNOTATION_STATUS = { confirmed: 'ok', suggested: 'warning', missing: 'error' } as const

/** The element ids a finding is about. */
function findingElements(finding: MatchFinding): string[] {
  return 'elementId' in finding ? [finding.elementId] : [finding.from, finding.to]
}

function DiagramMatchView({ map, diagram }: { map: CodeMapDetail; diagram: ProjectDiagram }) {
  const t = useT()
  const links = useCodeMapLinks(map.id, diagram.id)
  const [focus, setFocus] = React.useState<string | null>(null)
  if (links.isPending) return <Skeleton className="h-96 w-full" />
  if (links.isError)
    return (
      <Alert variant="destructive">
        <AlertTitle>{t.code.linksFailed}</AlertTitle>
        <AlertDescription>
          <Button variant="outline" size="sm" onClick={() => void links.refetch()}>
            {t.code.retry}
          </Button>
        </AlertDescription>
      </Alert>
    )
  const { match } = links.data
  if (match.elements.length === 0 && match.relations.length === 0)
    return (
      <Alert>
        <AlertDescription>{t.code.noMatch}</AlertDescription>
      </Alert>
    )
  const names = elementNames(diagram.content)
  const nameOf = (id: string) => names.get(id) ?? id
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <MatchDiagram diagram={diagram} match={match} onSelect={setFocus} />
      <div className="flex min-w-0 flex-col gap-4">
        <LinkSuggestions
          map={map}
          diagramId={diagram.id}
          links={links.data.links}
          match={match}
          nameOf={nameOf}
          focus={focus}
          onClearFocus={() => {
            setFocus(null)
          }}
        />
        <ReviewedLinks map={map} diagramId={diagram.id} links={links.data.links} nameOf={nameOf} />
      </div>
      <Findings findings={match.findings} nameOf={nameOf} className="xl:col-span-2" />
    </div>
  )
}

function MatchDiagram({
  diagram,
  match,
  onSelect,
}: {
  diagram: ProjectDiagram
  match: DiagramMatch
  onSelect: (element: string) => void
}) {
  const t = useT()
  const counts = new Map<string, number>()
  for (const finding of match.findings) {
    for (const id of findingElements(finding)) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  const annotations: UmlAnnotation[] = match.elements.map((element) => ({
    element: element.elementId,
    status: ANNOTATION_STATUS[element.status],
    label: t.code.status[element.status],
    ...(counts.get(element.elementId) ? { count: counts.get(element.elementId) } : {}),
  }))
  const found = match.elements.filter((element) => element.status !== 'missing').length
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>{diagram.title}</CardTitle>
        <CardDescription>{t.code.matched(found, match.elements.length)}</CardDescription>
      </CardHeader>
      <CardContent>
        {diagram.content && (
          <UmlDiagram
            diagram={diagram.content}
            label={diagram.title}
            height={460}
            annotations={annotations}
            onAnnotationSelect={onSelect}
          />
        )}
      </CardContent>
    </Card>
  )
}

/** The links to save: `links` with the one for this element and code replaced by `next`. */
function withLink(links: readonly DiagramCodeLink[], next: DiagramCodeLink): DiagramCodeLink[] {
  return [
    ...links.filter(
      (link) => !(link.elementId === next.elementId && link.codeKey === next.codeKey),
    ),
    next,
  ]
}

const SEPARATOR = '\u0000'

function LinkSuggestions({
  map,
  diagramId,
  links,
  match,
  nameOf,
  focus,
  onClearFocus,
}: {
  map: CodeMapDetail
  diagramId: number
  links: DiagramCodeLink[]
  match: DiagramMatch
  nameOf: (id: string) => string
  focus: string | null
  onClearFocus: () => void
}) {
  const t = useT()
  const save = useSaveCodeMapLinks(map.id, diagramId)
  const suggestions: Suggestion[] = match.elements
    .filter((element) => element.status === 'suggested')
    .filter((element) => focus === null || element.elementId === focus)
    .flatMap((element) =>
      element.candidates.map((candidate) => ({
        id: `${element.elementId}${SEPARATOR}${candidate.codeKey}`,
        text: candidate.codeKey,
        label: nameOf(element.elementId),
        detail: t.code.reasons[candidate.reason],
      })),
    )
  const store = async (link: DiagramCodeLink) => {
    try {
      await save.mutateAsync(withLink(links, link))
    } catch (error) {
      toast.error(getErrorMessage(error, t.code.saveFailed))
      throw error
    }
  }
  const elementOf = (suggestion: Suggestion) => suggestion.id.split(SEPARATOR)[0] ?? ''
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.code.suggestions}</CardTitle>
        <CardDescription>{t.code.suggestionsHint}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {focus !== null && (
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
            {t.code.onlyElement(nameOf(focus))}
            <Button variant="ghost" size="sm" onClick={onClearFocus}>
              {t.code.showAll}
            </Button>
          </div>
        )}
        <SuggestionList
          suggestions={suggestions}
          editable
          renderText={(text) => <code className="font-mono text-[12.5px] break-all">{text}</code>}
          empty={t.code.noSuggestions}
          onAccept={(suggestion, text) =>
            store({
              elementId: elementOf(suggestion),
              codeKey: text.trim() || suggestion.text,
              status: 'confirmed',
            })
          }
          onDismiss={(suggestion) =>
            store({ elementId: elementOf(suggestion), codeKey: suggestion.text, status: 'ignored' })
          }
        />
      </CardContent>
    </Card>
  )
}

function ReviewedLinks({
  map,
  diagramId,
  links,
  nameOf,
}: {
  map: CodeMapDetail
  diagramId: number
  links: DiagramCodeLink[]
  nameOf: (id: string) => string
}) {
  const t = useT()
  const save = useSaveCodeMapLinks(map.id, diagramId)
  // Kept across renders: a new array would send the table back to its first page.
  const reviewed = React.useMemo(() => links.filter((link) => link.status !== 'suggested'), [links])
  const undo = async (link: DiagramCodeLink) => {
    try {
      await save.mutateAsync(links.filter((other) => other !== link))
    } catch (error) {
      toast.error(getErrorMessage(error, t.code.saveFailed))
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.code.reviewed}</CardTitle>
      </CardHeader>
      <CardContent>
        {reviewed.length === 0 ? (
          <p className="m-0 text-[13px] text-muted-foreground">{t.code.reviewedEmpty}</p>
        ) : (
          <DataTable
            data={reviewed}
            getRowId={(link) => `${link.elementId}${SEPARATOR}${link.codeKey}`}
            filterColumn="element"
            filterPlaceholder={t.code.searchLinks}
            columns={[
              {
                // The search box filters this column, so its value holds the code key too.
                id: 'element',
                accessorFn: (link) => `${nameOf(link.elementId)} ${link.codeKey}`,
                header: ({ column }) => (
                  <DataTableColumnHeader column={column} title={t.code.linkElement} />
                ),
                cell: ({ row }) => (
                  <span className="flex flex-wrap items-center gap-2">
                    {nameOf(row.original.elementId)}
                    <Badge variant={row.original.status === 'confirmed' ? 'success' : 'secondary'}>
                      {row.original.status === 'confirmed'
                        ? t.code.linkConfirmed
                        : t.code.linkIgnored}
                    </Badge>
                  </span>
                ),
              },
              {
                id: 'code',
                accessorFn: (link) => link.codeKey,
                header: ({ column }) => (
                  <DataTableColumnHeader column={column} title={t.code.linkCode} />
                ),
                cell: ({ row }) => (
                  <span className="font-mono text-[12px] break-all whitespace-normal">
                    {row.original.codeKey}
                  </span>
                ),
              },
              {
                id: 'undo',
                enableSorting: false,
                header: () => <span className="sr-only">{t.code.undo}</span>,
                cell: ({ row }) => (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={save.isPending}
                    aria-label={t.code.undoLabel(
                      nameOf(row.original.elementId),
                      row.original.codeKey,
                    )}
                    onClick={() => void undo(row.original)}
                  >
                    <Undo2Icon /> {t.code.undo}
                  </Button>
                ),
              },
            ]}
          />
        )}
      </CardContent>
    </Card>
  )
}

function findingText(
  finding: MatchFinding,
  nameOf: (id: string) => string,
  t: ReturnType<typeof useT>,
): string {
  const kinds = t.code.findingKinds
  switch (finding.kind) {
    case 'missing-in-code':
      return kinds['missing-in-code'](nameOf(finding.elementId))
    case 'stale-link':
      return kinds['stale-link'](nameOf(finding.elementId), finding.codeKey)
    case 'relation-not-in-code':
      return kinds['relation-not-in-code'](nameOf(finding.from), nameOf(finding.to))
    case 'dependency-not-drawn':
      return kinds['dependency-not-drawn'](nameOf(finding.from), nameOf(finding.to), finding.count)
  }
}

function Findings({
  findings,
  nameOf,
  className,
}: {
  findings: MatchFinding[]
  nameOf: (id: string) => string
  className?: string
}) {
  const t = useT()
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{t.code.findings}</CardTitle>
      </CardHeader>
      <CardContent>
        {findings.length === 0 ? (
          <p className="m-0 text-[13px] text-muted-foreground">{t.code.noFindings}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {findings.map((finding) => {
              const text = findingText(finding, nameOf, t)
              return (
                <li key={`${finding.kind}:${text}`} className="flex items-start gap-2 text-[13px]">
                  {finding.kind === 'dependency-not-drawn' ? (
                    <TriangleAlertIcon
                      className="mt-0.5 size-4 shrink-0 text-warning"
                      aria-hidden
                    />
                  ) : (
                    <CircleXIcon className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                  )}
                  <span className="min-w-0 break-words">{text}</span>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
