// One view change the assistant proposed: what it does, its diff in the view's own text format,
// and the owner's answer (accept or reject while pending, undo once accepted).
import type { UmlSpec } from '@coreloom-uml/uml'

import { canWrite, type DiagramFormat, writeDiagram } from '@/components/diagram-editor'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DiffViewer } from '@/components/ui/diff-viewer'
import type { ChangeAction, ProposedChange } from '@/lib/assistant'
import { useCoreloomI18n } from '@/lib/i18n'
import { useT } from '@/lib/locale'

const STATUS_VARIANT = {
  pending: 'default',
  accepted: 'success',
  rejected: 'secondary',
  stale: 'warning',
  undone: 'secondary',
  failed: 'destructive',
} as const

/** The text of one side of the diff, written as the editor writes it (JSON when it can't). */
function diffText(spec: UmlSpec | null, format: DiagramFormat | null): string {
  if (!spec) return ''
  const target: DiagramFormat = format && canWrite(spec.kind, format) ? format : 'json'
  return writeDiagram(spec, target)
}

export function AssistantChangeCard({
  change,
  busy,
  onAction,
}: {
  change: ProposedChange
  /** Another action is on its way: the buttons wait. */
  busy: boolean
  onAction: (action: ChangeAction) => void
}) {
  const t = useT().assistant
  const problemText = useCoreloomI18n().messages.diagramEditor.problem
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{t.ops[change.op]}</Badge>
        <span className="min-w-0 flex-1 truncate font-medium text-foreground">{change.title}</span>
        <Badge variant={STATUS_VARIANT[change.status]}>{t.statuses[change.status]}</Badge>
      </div>
      {change.status === 'failed' ? (
        <div className="text-[13px] text-destructive">
          <p className="m-0">{t.failedHint}</p>
          <ul className="m-0 pl-5">
            {change.problems.map((problem) => (
              <li key={`${String(problem.line)}:${problem.code}:${problem.text ?? ''}`}>
                {problemText[problem.code]}
                {problem.text ? ` ${problem.text}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <DiffViewer
          before={diffText(change.before, change.format)}
          after={diffText(change.after, change.format)}
          beforeLabel={t.before}
          afterLabel={t.after}
          wrap
          className="max-h-80 overflow-auto"
        />
      )}
      {(change.placed > 0 || change.relayout) && (
        <p className="m-0 text-[13px] text-muted-foreground">
          {change.relayout ? t.relayout : t.placed(change.placed)}
        </p>
      )}
      {change.status === 'stale' && (
        <p className="m-0 text-[13px] text-muted-foreground">{t.staleHint}</p>
      )}
      {change.status === 'pending' && (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => {
              onAction('accept')
            }}
          >
            {t.accept}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              onAction('reject')
            }}
          >
            {t.reject}
          </Button>
        </div>
      )}
      {change.status === 'accepted' && (
        <Button
          size="sm"
          variant="outline"
          className="w-fit"
          disabled={busy}
          onClick={() => {
            onAction('undo')
          }}
        >
          {t.undo}
        </Button>
      )}
    </div>
  )
}
