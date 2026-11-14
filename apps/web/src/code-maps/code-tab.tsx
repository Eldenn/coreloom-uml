// A project's "Code" tab: the ways to add a code map while it has none; then the shown map (the
// newest, or one picked among the five kept), in three views: what the map holds, how each
// diagram matches it, and the processes no diagram documents.
import { PlusIcon, Trash2Icon } from 'lucide-react'
import * as React from 'react'

import { CodeDiagramLinks } from '@/code-maps/code-diagram-links'
import { CodeMapOverview } from '@/code-maps/code-map-overview'
import { CodeMapSources } from '@/code-maps/code-map-sources'
import { CodeProcesses } from '@/code-maps/code-processes'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Popconfirm } from '@/components/ui/popconfirm'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getErrorMessage } from '@/lib/client'
import {
  type CodeMapDetail,
  type CodeMapSummary,
  type CodeTabState,
  type CodeView,
  useCodeMap,
  useCodeMaps,
  useDeleteCodeMap,
} from '@/lib/code-maps'
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
      <div className="flex flex-wrap items-end gap-3">
        <MapPicker
          maps={maps}
          value={shown.id}
          onChange={(id) => {
            onStateChange({ ...state, map: id })
          }}
        />
        <div className="ml-auto flex flex-wrap gap-2">
          <Popconfirm
            title={t.code.deleteTitle}
            description={t.code.deleteText}
            confirmLabel={t.code.deleteConfirm}
            destructive
            onConfirm={deleteShown}
          >
            <Button variant="outline">
              <Trash2Icon /> {t.code.delete}
            </Button>
          </Popconfirm>
          <Button
            variant="outline"
            onClick={() => {
              setAdding(true)
            }}
          >
            <PlusIcon /> {t.code.addMap}
          </Button>
        </div>
      </div>
      <Tabs
        value={view}
        onValueChange={(next) => {
          onStateChange({ ...state, view: next as CodeView })
        }}
      >
        <TabsList>
          <TabsTrigger value="map">{t.code.viewOverview}</TabsTrigger>
          <TabsTrigger value="diagrams">{t.code.viewDiagrams}</TabsTrigger>
          <TabsTrigger value="processes">{t.code.viewProcesses}</TabsTrigger>
        </TabsList>
        <ShownMap id={shown.id}>
          {(map) => (
            <>
              <TabsContent value="map">
                {map.summary && <CodeMapOverview map={map} contents={map.summary} />}
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
              <TabsContent value="processes">
                <CodeProcesses map={map} />
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
  if (map.data.status !== 'ready' || !map.data.summary)
    return (
      <Alert className="mt-2">
        <AlertDescription>{t.code.notReady}</AlertDescription>
      </Alert>
    )
  return children(map.data)
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
      <Label htmlFor={id}>{t.code.version}</Label>
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
              {t.code.versionLabel(date.format(new Date(map.createdAt)), map.commitSha)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
