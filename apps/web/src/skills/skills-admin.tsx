// What only the admin does to the catalog from the Skills screen (the API refuses everyone else):
// run the skills.sh search now, scan the copies waiting for a verdict, and stop suggesting a skill
// or suggest it again. Each asks the queue: what changed arrives through the live updates.
import { RefreshCwIcon, ScanSearchIcon } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/sonner'
import { TuyauError } from '@/lib/client'
import { useT } from '@/lib/locale'
import { useQueueSkillScans } from '@/lib/skill-versions'
import { type SkillDetail, useBlockSkill, useRefreshSkills } from '@/lib/skills'

/** The API's bound on the reason (`SKILL_BLOCK_REASON_MAX_LENGTH`). */
const BLOCK_REASON_MAX = 300

export function SkillsAdminActions() {
  const t = useT().skills.admin
  const refresh = useRefreshSkills()
  const scans = useQueueSkillScans()
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={refresh.isPending}
        onClick={() => {
          refresh.mutate(undefined, {
            onSuccess: () => toast.success(t.refreshQueued),
            onError: (error) =>
              error instanceof TuyauError && error.status === 409
                ? toast.info(t.refreshRunning)
                : toast.error(t.refreshFailed),
          })
        }}
      >
        <RefreshCwIcon /> {t.refresh}
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={scans.isPending}
        onClick={() => {
          scans.mutate(undefined, {
            onSuccess: ({ queued }) => toast.success(t.scansQueued(queued)),
            onError: () => toast.error(t.scansFailed),
          })
        }}
      >
        <ScanSearchIcon /> {t.scans}
      </Button>
    </div>
  )
}

/** In a skill's sheet: stop suggesting it, with why, or suggest it again. */
export function SkillBlock({ skill }: { skill: SkillDetail }) {
  const t = useT().skills.admin
  const block = useBlockSkill()
  const [reason, setReason] = React.useState('')
  const blocked = skill.state === 'blocked'
  const id = `block-reason-${skill.slug}`
  return (
    <section className="flex flex-wrap items-end gap-2">
      {!blocked && (
        <div className="flex min-w-48 flex-1 flex-col gap-1.5">
          <Label htmlFor={id}>{t.blockReason}</Label>
          <Input
            id={id}
            value={reason}
            maxLength={BLOCK_REASON_MAX}
            onChange={(event) => {
              setReason(event.target.value)
            }}
          />
        </div>
      )}
      <Button
        variant={blocked ? 'outline' : 'destructive'}
        size="sm"
        disabled={block.isPending}
        onClick={() => {
          block.mutate(
            { slug: skill.slug, blocked: !blocked, reason: reason.trim() || undefined },
            {
              onSuccess: () => {
                setReason('')
                toast.success(blocked ? t.unblocked : t.blocked)
              },
              onError: () => toast.error(t.blockFailed),
            },
          )
        }}
      >
        {blocked ? t.unblock : t.block}
      </Button>
    </section>
  )
}
