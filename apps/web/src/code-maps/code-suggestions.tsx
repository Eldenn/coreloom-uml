// The diagrams worth drawing for a code map, proposed by the user's own model from an outline of
// the map. The list is asked for once, automatically, when a ready map is first shown with a
// provider set (`AutoSuggest`), and again on request. Each proposal is drawn as a new view in an
// architecture's assistant, where it is accepted or rejected, or set aside.
import { Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowRightLeftIcon,
  BoxesIcon,
  type LucideIcon,
  NetworkIcon,
  PackageIcon,
  SparklesIcon,
  WorkflowIcon,
} from 'lucide-react'
import * as React from 'react'

import { ArchitectureField } from '@/code-maps/code-processes'
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { useArchitectures } from '@/lib/architectures'
import {
  codeHref,
  type CodeMapDetail,
  type CodeMapSuggestion,
  type CodeMapSuggestions,
  splitCodeKey,
  type SuggestedDiagramKind,
  useCodeMapSuggestions,
  useDraftSuggestion,
  useSuggestDiagrams,
  useSuggestFailure,
  useSuggesting,
  useUpdateSuggestion,
} from '@/lib/code-maps'
import { useFeature } from '@/lib/feature-flags'
import { useCoreloomI18n } from '@/lib/i18n'
import { providerCallFailure, type StoredProvider, useStoredProvider } from '@/lib/llm-provider'
import { useLocale, useT } from '@/lib/locale'
import { useProviderFailureText } from '@/llm/provider-failure'

const KIND_ICONS: Record<SuggestedDiagramKind, LucideIcon> = {
  package: PackageIcon,
  component: BoxesIcon,
  class: NetworkIcon,
  sequence: ArrowRightLeftIcon,
  activity: WorkflowIcon,
}

const isProcess = (kind: SuggestedDiagramKind) => kind === 'sequence' || kind === 'activity'

/** Maps whose proposals were already asked for automatically in this tab: never twice. */
const asked = new Set<number>()

/**
 * Asks the user's model for the map's proposals once, the first time a ready map that has none
 * is shown with a provider set. A failure is shown in the proposals view; it is not retried.
 */
export function AutoSuggest({ map }: { map: CodeMapDetail }) {
  const provider = useStoredProvider()
  const { locale } = useLocale()
  const suggestions = useCodeMapSuggestions(map.id)
  const suggest = useSuggestDiagrams(map.id)
  const due = provider !== null && suggestions.data?.suggestedAt === null && !asked.has(map.id)
  React.useEffect(() => {
    // Checked again here: in development, React runs an effect twice.
    if (!due || asked.has(map.id)) return
    asked.add(map.id)
    suggest.mutate({ provider, locale: locale === 'fr' ? 'fr' : 'en' })
  }, [due, map.id, provider, locale, suggest])
  return null
}

/** How many proposals wait to be drawn, for the view's tab; a spinner while they are asked for. */
export function SuggestionsCount({ mapId }: { mapId: number }) {
  const suggestions = useCodeMapSuggestions(mapId)
  if (useSuggesting(mapId)) return <Spinner className="size-3.5" />
  const open = suggestions.data?.suggestions.filter((item) => item.status === 'open').length ?? 0
  return open > 0 ? <Badge variant="secondary">{open}</Badge> : null
}

export function CodeSuggestions({ map }: { map: CodeMapDetail }) {
  const t = useT()
  const { locale } = useLocale()
  const provider = useStoredProvider()
  const failureText = useProviderFailureText()
  const suggestions = useCodeMapSuggestions(map.id)
  const suggest = useSuggestDiagrams(map.id)
  const running = useSuggesting(map.id)
  const failure = useSuggestFailure(map.id)
  const run = () => {
    if (provider) suggest.mutate({ provider, locale: locale === 'fr' ? 'fr' : 'en' })
  }

  if (suggestions.isPending) return <Skeleton className="h-64 w-full" />
  if (suggestions.isError)
    return (
      <Alert variant="destructive">
        <AlertTitle>{t.code.suggestionsLoadFailed}</AlertTitle>
        <AlertDescription>
          <Button variant="outline" size="sm" onClick={() => void suggestions.refetch()}>
            {t.code.retry}
          </Button>
        </AlertDescription>
      </Alert>
    )

  const { suggestedAt } = suggestions.data
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.code.viewSuggestions}</CardTitle>
        <CardDescription>{t.code.diagramSuggestionsHint}</CardDescription>
        {provider && (
          <CardAction>
            <Button
              variant={suggestedAt === null ? 'default' : 'outline'}
              disabled={running}
              onClick={run}
              title={suggestedAt === null ? undefined : t.code.suggestionsAgainHint}
            >
              {running ? <Spinner /> : <SparklesIcon />}
              {suggestedAt === null ? t.code.suggestionsRun : t.code.suggestionsAgain}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!provider && (
          <Alert>
            <AlertDescription className="flex flex-col items-start gap-3">
              {t.code.suggestionsNoProvider}
              <Button variant="outline" size="sm" asChild>
                <Link to="/settings">{t.code.reviewOpenSettings}</Link>
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {failure && !running && (
          <Alert variant="destructive">
            <AlertTitle>{t.code.suggestionsFailed}</AlertTitle>
            <AlertDescription>{failureText(providerCallFailure(failure))}</AlertDescription>
          </Alert>
        )}
        {running ? (
          <div className="flex flex-col gap-3" aria-busy>
            <p className="m-0 flex items-center gap-2 text-[13px] text-fg-secondary">
              <Spinner /> {t.code.suggestionsRunning}
            </p>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <SuggestionList map={map} data={suggestions.data} provider={provider} />
        )}
      </CardContent>
    </Card>
  )
}

/** The proposals, those set aside folded away at the end. */
function SuggestionList({
  map,
  data,
  provider,
}: {
  map: CodeMapDetail
  data: CodeMapSuggestions
  provider: StoredProvider | null
}) {
  const t = useT()
  const { locale } = useLocale()
  const { suggestedAt, suggestions: list } = data
  const shown = list.filter((item) => item.status !== 'dismissed')
  const dismissed = list.filter((item) => item.status === 'dismissed')
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })
  return (
    <>
      {suggestedAt !== null && (
        <p className="m-0 text-[12.5px] text-muted-foreground">
          {t.code.suggestionsAt(date.format(new Date(suggestedAt)))}
        </p>
      )}
      {suggestedAt !== null && list.length === 0 && (
        <p className="m-0 text-[13px] text-muted-foreground">{t.code.suggestionsNone}</p>
      )}
      {shown.length > 0 && (
        <ItemGroup className="gap-2">
          {shown.map((suggestion) => (
            <SuggestionItem
              key={suggestion.id}
              map={map}
              suggestion={suggestion}
              provider={provider}
            />
          ))}
        </ItemGroup>
      )}
      {dismissed.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="self-start">
              {t.code.suggestionsDismissed(dismissed.length)}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ItemGroup className="mt-2 gap-2">
              {dismissed.map((suggestion) => (
                <SuggestionItem
                  key={suggestion.id}
                  map={map}
                  suggestion={suggestion}
                  provider={provider}
                />
              ))}
            </ItemGroup>
          </CollapsibleContent>
        </Collapsible>
      )}
    </>
  )
}

function SuggestionItem({
  map,
  suggestion,
  provider,
}: {
  map: CodeMapDetail
  suggestion: CodeMapSuggestion
  provider: StoredProvider | null
}) {
  const t = useT()
  const kinds = useCoreloomI18n().messages.diagram.kinds
  const assistant = useFeature('diagram-assistant')
  const update = useUpdateSuggestion(map.id)
  const [drawing, setDrawing] = React.useState(false)
  const Icon = KIND_ICONS[suggestion.kind]
  const { status } = suggestion
  return (
    <Item variant="outline" className={status === 'dismissed' ? 'opacity-70' : undefined}>
      <ItemMedia variant="icon">
        <Icon />
      </ItemMedia>
      <ItemContent className="min-w-0 basis-72">
        <ItemTitle className="flex flex-wrap items-center gap-2">
          {suggestion.title}
          <Badge variant="secondary">{kinds[suggestion.kind]}</Badge>
          {status === 'drafted' && <Badge>{t.code.suggestionDrafted}</Badge>}
        </ItemTitle>
        {suggestion.reason && <ItemDescription>{suggestion.reason}</ItemDescription>}
        <FocusLine map={map} suggestion={suggestion} />
      </ItemContent>
      <ItemActions className="flex-wrap">
        <SuggestionActions
          suggestion={suggestion}
          canDraw={assistant && provider !== null}
          onDraw={() => {
            setDrawing(true)
          }}
          onStatusChange={(next) => {
            update.mutate({ id: suggestion.id, status: next })
          }}
          updating={update.isPending}
        />
      </ItemActions>
      {provider && (
        <DraftDialog
          open={drawing}
          onOpenChange={setDrawing}
          map={map}
          suggestion={suggestion}
          provider={provider}
        />
      )}
    </Item>
  )
}

/** Open a drawn proposal, bring back one set aside, or draw or set aside an open one. */
function SuggestionActions({
  suggestion,
  canDraw,
  onDraw,
  onStatusChange,
  updating,
}: {
  suggestion: CodeMapSuggestion
  canDraw: boolean
  onDraw: () => void
  onStatusChange: (status: 'open' | 'dismissed') => void
  updating: boolean
}) {
  const t = useT()
  const navigate = useNavigate()
  const { status, architectureId, conversationId } = suggestion
  if (status === 'drafted') {
    if (architectureId === null) return null
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          void navigate({
            to: '/architectures/$id',
            params: { id: architectureId },
            search: conversationId === null ? {} : { assistant: conversationId },
          })
        }}
      >
        {t.code.suggestionOpen}
      </Button>
    )
  }
  if (status === 'dismissed')
    return (
      <Button
        variant="ghost"
        size="sm"
        disabled={updating}
        onClick={() => {
          onStatusChange('open')
        }}
      >
        {t.code.suggestionRestore}
      </Button>
    )
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        disabled={updating}
        onClick={() => {
          onStatusChange('dismissed')
        }}
      >
        {t.code.suggestionDismiss}
      </Button>
      {canDraw && (
        <Button size="sm" onClick={onDraw}>
          <SparklesIcon /> {t.code.suggestionDraw}
        </Button>
      )}
    </>
  )
}

/** The code a proposal covers: where a process starts, or the folders and classes drawn. */
function FocusLine({ map, suggestion }: { map: CodeMapDetail; suggestion: CodeMapSuggestion }) {
  const t = useT()
  const process = isProcess(suggestion.kind)
  const entries = new Map(map.summary?.entries.map((entry) => [entry.key, entry.kind]))
  return (
    <p className="m-0 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12.5px] text-muted-foreground">
      <span>{process ? t.code.suggestionStarts : t.code.suggestionCovers}</span>
      {suggestion.focus.map((key) => {
        const { path, name } = splitCodeKey(key)
        const label = name ?? path
        const href = codeHref(map, key)
        return (
          <span key={key} className="font-mono break-all text-fg-secondary">
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                title={key}
                className="text-primary-text underline-offset-2 hover:underline"
              >
                {label}
              </a>
            ) : (
              <span title={key}>{label}</span>
            )}
            {process && (
              <span className="ml-1 font-sans break-normal">
                (
                {entries.has(key)
                  ? t.code.entryKinds[entries.get(key) ?? 'route']
                  : t.code.suggestionRoot}
                )
              </span>
            )}
          </span>
        )
      })}
    </p>
  )
}

/** Picks the architecture the new view goes to, then has the user's model draw it. */
function DraftDialog({
  open,
  onOpenChange,
  map,
  suggestion,
  provider,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  map: CodeMapDetail
  suggestion: CodeMapSuggestion
  provider: StoredProvider
}) {
  const t = useT()
  const { locale } = useLocale()
  const failureText = useProviderFailureText()
  const navigate = useNavigate()
  const architectures = useArchitectures(map.projectId, '')
  const draft = useDraftSuggestion(map.id)
  const list = architectures.data?.data ?? []
  const [chosen, setChosen] = React.useState<number | null>(null)
  const architectureId = chosen ?? list.at(0)?.id ?? null

  const submit = () => {
    if (architectureId === null) return
    draft.mutate(
      {
        id: suggestion.id,
        provider,
        architectureId,
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
        if (!draft.isPending) onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t.code.draftTitle}</DialogTitle>
          <DialogDescription>
            {t.code.draftText(suggestion.title, provider.model)}
          </DialogDescription>
        </DialogHeader>
        <ArchitectureChoice
          architectures={architectures.isPending ? null : list}
          architectureId={architectureId}
          onChange={setChosen}
          disabled={draft.isPending}
        />
        {draft.isError && (
          <Alert variant="destructive">
            <AlertTitle>{t.code.proposeFailed}</AlertTitle>
            <AlertDescription>{failureText(providerCallFailure(draft.error))}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={draft.isPending}
            onClick={() => {
              onOpenChange(false)
            }}
          >
            {t.code.cancel}
          </Button>
          <Button disabled={architectureId === null || draft.isPending} onClick={submit}>
            {draft.isPending ? <Spinner /> : <SparklesIcon />}
            {draft.isPending ? t.code.proposing : t.code.suggestionDraw}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** The architecture field, a placeholder while loading, or why there is none to pick. */
export function ArchitectureChoice({
  architectures,
  architectureId,
  onChange,
  disabled,
}: {
  architectures: { id: number; title: string }[] | null
  architectureId: number | null
  onChange: (id: number) => void
  disabled: boolean
}) {
  const t = useT()
  if (architectures === null) return <Skeleton className="h-16 w-full" />
  if (architectures.length === 0)
    return <p className="m-0 text-[13px] text-muted-foreground">{t.code.proposeNoArchitecture}</p>
  return (
    <ArchitectureField
      architectures={architectures}
      architectureId={architectureId}
      onChange={onChange}
      disabled={disabled}
    />
  )
}
