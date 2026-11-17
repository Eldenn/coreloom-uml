import * as React from 'react'

import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useT } from '@/lib/locale'

/** Whether a message asks for a diagram drawn from the project's code map, and what that sends. */
export function CodeSwitch({
  checked,
  onCheckedChange,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  const t = useT().assistant
  const id = React.useId()
  return (
    <div className="flex flex-col gap-2 border-b border-border p-3">
      <div className="flex items-center gap-2">
        <Switch id={id} size="sm" checked={checked} onCheckedChange={onCheckedChange} />
        <Label htmlFor={id}>{t.code}</Label>
      </div>
      {checked && <p className="m-0 text-[12px] text-muted-foreground">{t.codeHint}</p>}
    </div>
  )
}
