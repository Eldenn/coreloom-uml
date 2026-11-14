// The processes no diagram documents: from each entry point, the calls followed a few levels
// down that touch no code linked to a diagram. Largest first; each opens to show the calls.
import { WorkflowIcon } from 'lucide-react'

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
import { Skeleton } from '@/components/ui/skeleton'
import {
  codeHref,
  type CodeMapDetail,
  type CodeMapProcess,
  splitCodeKey,
  useCodeMapProcesses,
} from '@/lib/code-maps'
import { useT } from '@/lib/locale'

export function CodeProcesses({ map }: { map: CodeMapDetail }) {
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
        {total === 0 ? (
          <p className="m-0 text-[13px] text-muted-foreground">{t.code.noProcesses}</p>
        ) : (
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
      </AccordionContent>
    </AccordionItem>
  )
}
