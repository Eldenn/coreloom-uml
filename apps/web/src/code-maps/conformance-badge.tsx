// How many findings the deterministic match of the diagrams against a code map holds, for a tab:
// red when the code contradicts a diagram, amber when diagrams are only behind it, nothing when
// they agree (or while the count is unknown).
import { Badge } from '@/components/ui/badge'
import type { ConformanceCounts } from '@/lib/code-maps'
import { useT } from '@/lib/locale'

export function ConformanceBadge({ counts }: { counts: ConformanceCounts | undefined }) {
  const t = useT()
  if (!counts || counts.error + counts.warning === 0) return null
  return (
    <Badge variant={counts.error > 0 ? 'destructive' : 'warning'}>
      <span aria-hidden>{counts.error + counts.warning}</span>
      <span className="sr-only">{t.code.findingsLabel(counts.error, counts.warning)}</span>
    </Badge>
  )
}
