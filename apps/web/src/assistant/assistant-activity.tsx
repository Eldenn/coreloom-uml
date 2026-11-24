// What the assistant is doing while it writes a reply: each tool it calls as a coreloom-ui
// ToolCall card (running, then done), with what a repository tool asks of the sandbox (a path, a
// query, a command) in its title and what a command prints inside, as it comes. Shown live only:
// nothing of it is kept once the reply is stored.
import * as React from 'react'

import { AnsiOutput } from '@/components/ui/ansi-output'
import { ToolCall } from '@/components/ui/tool-call'
import type { ToolActivity } from '@/lib/assistant-chat'
import { useT } from '@/lib/locale'

export function AssistantActivity({ activity }: { activity: readonly ToolActivity[] }) {
  const t = useT().assistant
  if (activity.length === 0) return null
  return (
    <ol aria-label={t.activity} className="m-0 mr-6 flex list-none flex-col gap-1.5 p-0">
      {activity.map((step) => (
        <li key={step.id}>
          <Step step={step} />
        </li>
      ))}
    </ol>
  )
}

function Step({ step }: { step: ToolActivity }) {
  const t = useT().assistant
  // Folded until a command prints something; the owner's own choice wins afterwards.
  const [open, setOpen] = React.useState<boolean>()
  const name = step.tool.replaceAll('_', ' ')
  return (
    <ToolCall
      part={{
        type: 'dynamic-tool',
        toolName: step.tool,
        toolCallId: step.id,
        state: step.status === 'running' ? 'input-available' : 'output-available',
      }}
      label={step.detail === undefined ? name : `${name}: ${step.detail}`}
      open={open ?? step.output !== undefined}
      onOpenChange={setOpen}
      tool={{
        render: () =>
          step.output === undefined ? (
            <p className="m-0 text-[12px] text-muted-foreground">{t.activityHidden}</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              <AnsiOutput
                text={step.output}
                links={false}
                maxHeight="12rem"
                aria-label={t.activityOutput}
                className="text-[11px]"
              />
              {step.exitCode !== undefined && step.exitCode !== 0 && (
                <p className="m-0 text-[12px] text-muted-foreground">
                  {t.activityExit(step.exitCode)}
                </p>
              )}
            </div>
          ),
      }}
    />
  )
}
