// "Design from a brief", on a project's Design tab: the owner says what they need to build, and
// the assistant, in "Auto", leads a new conversation from it to requirements, one decision, then
// views. Every step is a proposal the owner accepts in the chat.
import { SparklesIcon } from 'lucide-react'
import * as React from 'react'
import { z } from 'zod'

import { useAutoOffered } from '@/assistant/use-subject'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAppForm } from '@/components/ui/form'
import { toast } from '@/components/ui/sonner'
import { useCreateConversation } from '@/lib/assistant'
import { useAssistant } from '@/lib/assistant-context'
import { getErrorMessage } from '@/lib/client'
import { useFeature } from '@/lib/feature-flags'
import { useStoredProvider } from '@/lib/llm-provider'
import { useT } from '@/lib/locale'

/** As the API's `ASSISTANT_MESSAGE_MAX_LENGTH`: the brief is the conversation's first message. */
const BRIEF_MAX_LENGTH = 4000

export function DesignBrief({ projectId }: { projectId: number }) {
  const t = useT().design
  const [open, setOpen] = React.useState(false)
  const autoOffered = useAutoOffered(useStoredProvider())
  const offered = useFeature('diagram-assistant') && autoOffered
  if (!offered) return null
  return (
    <>
      <div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setOpen(true)
          }}
        >
          <SparklesIcon /> {t.briefAction}
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.briefTitle}</DialogTitle>
            <DialogDescription>{t.briefDescription}</DialogDescription>
          </DialogHeader>
          <BriefForm
            projectId={projectId}
            onDone={() => {
              setOpen(false)
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}

function BriefForm({ projectId, onDone }: { projectId: number; onDone: () => void }) {
  const t = useT().design
  const create = useCreateConversation()
  const { startBrief } = useAssistant()
  const form = useAppForm({
    defaultValues: { brief: '' },
    validators: {
      onSubmit: z.object({
        brief: z.string().trim().min(1, t.briefRequired).max(BRIEF_MAX_LENGTH),
      }),
    },
    onSubmit: async ({ value }) => {
      try {
        const { conversation } = await create.mutateAsync(t.briefConversation)
        startBrief(conversation.id, projectId, value.brief.trim())
        onDone()
      } catch (error) {
        toast.error(getErrorMessage(error, t.briefFailed))
      }
    },
  })
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.AppForm>
        <form.AppField name="brief">
          {(field) => (
            <field.TextareaField
              label={t.brief}
              description={t.briefHint}
              maxCount={BRIEF_MAX_LENGTH}
              rows={8}
            />
          )}
        </form.AppField>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            {t.cancel}
          </Button>
          <form.SubmitButton>{t.briefStart}</form.SubmitButton>
        </DialogFooter>
      </form.AppForm>
    </form>
  )
}
