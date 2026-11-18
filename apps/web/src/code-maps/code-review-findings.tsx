// One diagram of a conformance review: the drawing with a badge on each element the findings are
// about (its worst finding, and how many are still open), and the findings as cards, to mark done,
// dismiss or open again. Each card cites the places in the code it rests on.
import * as React from 'react'

import { FindingList } from '@/code-maps/finding-list'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { UmlDiagram } from '@/components/ui/uml-diagram'
import { annotationsOf } from '@/lib/code-review-findings'
import type { CodeReview, CodeReviewDiagram, CodeReviewFinding } from '@/lib/code-reviews'
import { useT } from '@/lib/locale'
import { elementNames, type ProjectDiagram } from '@/lib/project-diagrams'

export function ReviewedDiagram({
  projectId,
  review,
  entry,
  entries,
  diagram,
  findings,
  onDiagramChange,
}: {
  projectId: number
  review: CodeReview
  entry: CodeReviewDiagram
  entries: CodeReviewDiagram[]
  diagram: ProjectDiagram | undefined
  findings: CodeReviewFinding[]
  onDiagramChange: (id: number) => void
}) {
  const t = useT()
  const [focus, setFocus] = React.useState<string | null>(null)
  const pickerId = React.useId()
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Card className="min-w-0 xl:sticky xl:top-18 xl:self-start">
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-2 sm:w-96">
            <Label htmlFor={pickerId}>{t.code.diagram}</Label>
            <Select
              value={String(entry.diagramId)}
              onValueChange={(next) => {
                setFocus(null)
                onDiagramChange(Number(next))
              }}
            >
              <SelectTrigger id={pickerId} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {entries.map((item) => (
                  <SelectItem key={item.diagramId} value={String(item.diagramId)}>
                    {item.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <CardDescription>{t.code.reviewFound(entry.findingCount)}</CardDescription>
        </CardHeader>
        <CardContent>
          {diagram?.content ? (
            <UmlDiagram
              diagram={diagram.content}
              label={diagram.title}
              height="max(460px, calc(100svh - 18rem))"
              highlighted={focus === null ? [] : [focus]}
              annotations={annotationsOf(findings, t)}
              onAnnotationSelect={setFocus}
            />
          ) : (
            <p className="m-0 text-[13px] text-muted-foreground">{t.code.reviewDiagramGone}</p>
          )}
        </CardContent>
      </Card>
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>{t.code.reviewFindings}</CardTitle>
          <CardDescription>{t.code.reviewFindingsHint}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <FindingList
            projectId={projectId}
            review={review}
            findings={findings}
            names={elementNames(diagram?.content ?? null)}
            focus={focus}
            onFocusChange={setFocus}
          />
        </CardContent>
      </Card>
    </div>
  )
}
