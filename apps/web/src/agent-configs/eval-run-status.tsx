// A convention test's status in words, with a dot that pulses while it goes.
import { StatusIndicator, type StatusTone } from '@/components/ui/status-indicator'
import { type EvalRunStatus, isRunActive } from '@/lib/convention-eval-results'
import { useT } from '@/lib/locale'

const STATUS_TONES: Record<EvalRunStatus, StatusTone> = {
  queued: 'neutral',
  running: 'primary',
  done: 'success',
  failed: 'danger',
  cancelled: 'warning',
  leaked: 'danger',
}

export function RunStatus({ status }: { status: EvalRunStatus }) {
  const t = useT().evals
  return (
    <StatusIndicator tone={STATUS_TONES[status]} pulse={isRunActive(status)} variant="pill">
      {t.status[status]}
    </StatusIndicator>
  )
}
