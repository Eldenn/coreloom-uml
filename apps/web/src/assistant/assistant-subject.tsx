// Next to the prompt: what the message is about (`useSubject`), and with "From the web" the agent
// conventions the rules are for.
import * as React from 'react'

import type { Subject } from '@/assistant/use-subject'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useT } from '@/lib/locale'

const ARCHITECTURE_PREFIX = 'architecture:'

export function SubjectPicker({ subject, disabled }: { subject: Subject; disabled: boolean }) {
  const t = useT().assistant
  const id = React.useId()
  const { mode, architectureId, configId, architectures, configs } = subject
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Label htmlFor={id} className="shrink-0 text-[12px] text-muted-foreground">
          {t.about}
        </Label>
        <Select
          value={mode === 'architecture' ? `${ARCHITECTURE_PREFIX}${String(architectureId)}` : mode}
          disabled={disabled}
          onValueChange={(value) => {
            if (value === 'web' || value === 'none') subject.choose(value)
            else subject.chooseArchitecture(Number(value.slice(ARCHITECTURE_PREFIX.length)))
          }}
        >
          <SelectTrigger id={id} size="sm" className="min-w-0 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t.aboutNothing}</SelectItem>
            {subject.webOffered && <SelectItem value="web">{t.aboutWeb}</SelectItem>}
            {architectures.length > 0 && (
              <SelectGroup>
                <SelectLabel>{t.aboutArchitectures}</SelectLabel>
                {architectures.map((a) => (
                  <SelectItem key={a.id} value={`${ARCHITECTURE_PREFIX}${String(a.id)}`}>
                    {a.title}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>
      </div>
      {mode === 'web' &&
        (configs.length === 0 ? (
          <p className="m-0 text-[12px] text-muted-foreground">{t.noConventions}</p>
        ) : (
          <Select
            value={configId === null ? '' : String(configId)}
            disabled={disabled}
            onValueChange={(value) => {
              subject.chooseConventions(Number(value))
            }}
          >
            <SelectTrigger size="sm" aria-label={t.conventions} className="min-w-0">
              <SelectValue placeholder={t.chooseConventions} />
            </SelectTrigger>
            <SelectContent>
              {configs.map((config) => (
                <SelectItem key={config.id} value={String(config.id)}>
                  {config.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
    </div>
  )
}
