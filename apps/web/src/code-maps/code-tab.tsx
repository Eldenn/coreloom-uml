// A project's "Code" tab: the ways to add a code map while it has none; then the shown map (the
// newest, or one picked among the five kept), in five views: what the map holds, the diagrams the
// user's own model proposes for it, how each diagram matches it, the conformance reviews of the
// diagrams by that model, and the processes no diagram documents.
import { EllipsisIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react'
import * as React from 'react'

import { OpenAssistantButton } from '@/code-maps/code-assistant'
import { CodeDiagramLinks } from '@/code-maps/code-diagram-links'
import { CodeMapOverview } from '@/code-maps/code-map-overview'
import { CodeMapSources } from '@/code-maps/code-map-sources'
import { CodeProcesses } from '@/code-maps/code-processes'
import { CodeReviews } from '@/code-maps/code-reviews'
import { AutoSuggest, CodeSuggestions, SuggestionsCount } from '@/code-maps/code-suggestions'
import { ConformanceBadge } from '@/code-maps/conformance-badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { RelativeTime } from '@/components/ui/relative-time'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/sonner'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getErrorMessage } from '@/lib/client'
import {
  type CodeMapDetail,
  type CodeMapSummary,
  type CodeTabState,
  type CodeView,
  useCodeConformance,
  useCodeMap,
  useCodeMaps,
  useDeleteCodeMap,
} from '@/lib/code-maps'
import { useGithubFollow } from '@/lib/github'
import { useLocale, useT } from '@/lib/locale'

export function CodeTab({
  projectId,
  state,
  onStateChange,
}: {
  projectId: number
  state: CodeTabState
  onStateChange: (state: CodeTabState) => void
}) {
  const t = useT()
  const maps = useCodeMaps(projectId)
  if (maps.isPending) return <Skeleton className="h-64 w-full" />
  if (maps.isError)
    return (
      <Alert variant="destructive">
        <AlertTitle>{t.code.loadFailed}</AlertTitle>
        <AlertDescription>
          <Button variant="outline" size="sm" onClick={() => void maps.refetch()}>
            {t.code.retry}
          </Button>
        </AlertDescription>
      </Alert>
    )
  const shown = maps.data.find((map) => map.id === state.map) ?? maps.data.at(0)
  if (!shown)
    return (
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>{t.code.introTitle}</CardTitle>
            <CardDescription>{t.code.intro}</CardDescription>
          </CardHeader>
        </Card>
        <CodeMapSources
          projectId={projectId}
          onAdded={(id) => {
            onStateChange({ map: id })
          }}
        />
      </div>
    )
  return (
    <CodeMapPanel
      projectId={projectId}
      maps={maps.data}
      shown={shown}
      state={state}
      onStateChange={onStateChange}
    />
  )
}

function CodeMapPanel({
  projectId,
  maps,
  shown,
  state,
  onStateChange,
}: {
  projectId: number
  maps: CodeMapSummary[]
  shown: CodeMapSummary
  state: CodeTabState
  onStateChange: (state: CodeTabState) => void
}) {
  const t = useT()
  const [adding, setAdding] = React.useState(false)
  const remove = useDeleteCodeMap(projectId)
  const view = state.view ?? 'map'
  const conformance = useCodeConformance(projectId, shown.id, shown.status === 'ready')
  const deleteShown = async () => {
    try {
      await remove.mutateAsync(shown.id)
      toast.success(t.code.deleted)
      onStateChange({ view })
    } catch (error) {
      toast.error(getErrorMessage(error, t.code.uploadFailed))
    }
  }
  return (
    <div className="flex flex-col gap-4">
      <Tabs
        value={view}
        onValueChange={(next) => {
          onStateChange({ ...state, view: next as CodeView })
        }}
      >
        {/* One row for the whole tab: its views on the left, the map they read on the right. */}
        <div className="flex flex-wrap items-center gap-3">
          <TabsList className="max-w-full justify-start overflow-x-auto">
            <TabsTrigger value="map">{t.code.viewOverview}</TabsTrigger>
            <TabsTrigger value="suggestions">
              {t.code.viewSuggestions}
              {shown.status === 'ready' && <SuggestionsCount mapId={shown.id} />}
            </TabsTrigger>
            <TabsTrigger value="diagrams">
              {t.code.viewDiagrams}
              <ConformanceBadge counts={conformance.data?.counts} />
            </TabsTrigger>
            <TabsTrigger value="review">{t.code.viewReview}</TabsTrigger>
            <TabsTrigger value="processes">
              {t.code.viewProcesses}
              {!!conformance.data?.undocumentedProcesses && (
                <Badge variant="secondary">{conformance.data.undocumentedProcesses}</Badge>
              )}
            </TabsTrigger>
          </TabsList>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <MapPicker
              maps={maps}
              value={shown.id}
              onChange={(id) => {
                onStateChange({ ...state, map: id })
              }}
            />
            <FollowBadge projectId={projectId} />
            <div className="flex flex-wrap gap-2">
              <OpenAssistantButton map={shown} />
              <Button
                variant="outline"
                onClick={() => {
                  setAdding(true)
                }}
              >
                <PlusIcon /> {t.code.addMap}
              </Button>
              <MapActions onDelete={deleteShown} />
            </div>
          </div>
        </div>
        <ShownMap id={shown.id}>
          {(map) => (
            <>
              <AutoSuggest map={map} />
              <TabsContent value="map">
                {map.summary && <CodeMapOverview map={map} contents={map.summary} />}
              </TabsContent>
              <TabsContent value="suggestions">
                <CodeSuggestions map={map} />
              </TabsContent>
              <TabsContent value="diagrams">
                <CodeDiagramLinks
                  projectId={projectId}
                  map={map}
                  diagramId={state.diagram}
                  onDiagramChange={(diagram) => {
                    onStateChange({ ...state, diagram })
                  }}
                />
              </TabsContent>
              <TabsContent value="review">
                <CodeReviews
                  projectId={projectId}
                  map={map}
                  reviewId={state.review}
                  diagramId={state.diagram}
                  onChange={(next) => {
                    onStateChange({ ...state, ...next })
                  }}
                />
              </TabsContent>
              <TabsContent value="processes">
                <CodeProcesses
                  map={map}
                  onShowSuggestions={() => {
                    onStateChange({ ...state, view: 'suggestions' })
                  }}
                />
              </TabsContent>
            </>
          )}
        </ShownMap>
      </Tabs>
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{t.code.addTitle}</DialogTitle>
            <DialogDescription>{t.code.addDescription}</DialogDescription>
          </DialogHeader>
          <CodeMapSources
            projectId={projectId}
            onAdded={(id) => {
              setAdding(false)
              onStateChange({ ...state, map: id })
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** The rarer actions on the shown map, behind a menu; deleting asks first. */
function MapActions({ onDelete }: { onDelete: () => Promise<void> }) {
  const t = useT()
  const [deleting, setDeleting] = React.useState(false)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label={t.code.moreActions}>
            <EllipsisIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => {
              setDeleting(true)
            }}
          >
            <Trash2Icon /> {t.code.delete}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.code.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.code.deleteText}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.code.cancel}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onDelete}>
              {t.code.deleteConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/** The shown map's details, once it is read; a map still being read, or that failed, says so. */
function ShownMap({
  id,
  children,
}: {
  id: number
  children: (map: CodeMapDetail) => React.ReactNode
}) {
  const t = useT()
  const map = useCodeMap(id)
  if (map.isPending) return <Skeleton className="mt-2 h-64 w-full" />
  if (map.isError)
    return (
      <Alert variant="destructive" className="mt-2">
        <AlertTitle>{t.code.loadFailed}</AlertTitle>
        <AlertDescription>
          <Button variant="outline" size="sm" onClick={() => void map.refetch()}>
            {t.code.retry}
          </Button>
        </AlertDescription>
      </Alert>
    )
  if (map.data.status === 'failed')
    return (
      <Alert variant="destructive" className="mt-2">
        <AlertDescription>{t.code.failed(map.data.failureReason)}</AlertDescription>
      </Alert>
    )
  if (map.data.status !== 'ready' || !map.data.summary) {
    const repository = map.data.repositoryUrl?.replace(/^https?:\/\/(?:www\.)?github\.com\//, '')
    return (
      <Alert className="mt-2">
        <Spinner />
        <AlertTitle>
          {map.data.status === 'pending' ? t.code.readingQueued : t.code.readingRunning}
        </AlertTitle>
        <AlertDescription className="flex flex-col gap-1">
          <span>
            {repository && (
              <span className="font-mono text-[12.5px] break-all">
                {repository}
                {map.data.branch ? `@${map.data.branch}` : ''} ·{' '}
              </span>
            )}
            {t.code.added} <RelativeTime date={map.data.createdAt} />
          </span>
          <span>{t.code.notReady}</span>
        </AlertDescription>
      </Alert>
    )
  }
  return children(map.data)
}

/** The repository the project reads again on each push, beside the version it produced. */
function FollowBadge({ projectId }: { projectId: number }) {
  const t = useT()
  const follow = useGithubFollow(projectId)
  if (!follow.data) return null
  const { repositoryUrl, branch, active } = follow.data
  const name = repositoryUrl.replace(/^https:\/\/github\.com\//, '')
  return (
    <Badge variant={active ? 'secondary' : 'warning'} className="mb-1.5 max-w-full">
      <RefreshCwIcon aria-hidden />
      <span className="truncate">
        {active
          ? t.code.followBadge(name, branch ?? t.code.githubDefaultBranch)
          : t.code.followBadgeLost(name)}
      </span>
    </Badge>
  )
}

function MapPicker({
  maps,
  value,
  onChange,
}: {
  maps: CodeMapSummary[]
  value: number
  onChange: (id: number) => void
}) {
  const t = useT()
  const { locale } = useLocale()
  const id = React.useId()
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className="sr-only">
        {t.code.version}
      </Label>
      <Select
        value={String(value)}
        onValueChange={(next) => {
          onChange(Number(next))
        }}
      >
        <SelectTrigger id={id} className="w-72">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {maps.map((map) => (
            <SelectItem key={map.id} value={String(map.id)}>
              {t.code.versionLabel(date.format(new Date(map.createdAt)), map.commitSha, map.status)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
