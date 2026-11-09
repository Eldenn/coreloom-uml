// Labels, badges and URL parsing shared by the Skills screen's parts.
import { Badge, BadgeDot } from '@/components/ui/badge'
import { useT } from '@/lib/locale'
import type { SkillRisk, SkillState } from '@/lib/skills'

const RISK_VARIANTS: Record<SkillRisk, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  safe: 'success',
  low: 'success',
  unknown: 'secondary',
  none: 'secondary',
  medium: 'warning',
  high: 'destructive',
  critical: 'destructive',
}

export function RiskBadge({ risk }: { risk: SkillRisk }) {
  const t = useT()
  return (
    <Badge variant={RISK_VARIANTS[risk]}>
      <BadgeDot />
      {t.skills.risks[risk]}
    </Badge>
  )
}

const STATE_VARIANTS: Record<SkillState, 'default' | 'outline' | 'secondary'> = {
  suggested: 'default',
  catalogued: 'outline',
  blocked: 'secondary',
}

export function StateBadge({ state }: { state: SkillState }) {
  const t = useT()
  return <Badge variant={STATE_VARIANTS[state]}>{t.skills.states[state]}</Badge>
}
