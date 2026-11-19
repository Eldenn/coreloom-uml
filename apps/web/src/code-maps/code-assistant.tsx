// Opens the assistant on one of the project's architectures, in a new conversation set to draw
// from this code map: the user then asks for any diagram in their own words.
import { useNavigate } from '@tanstack/react-router'
import { SparklesIcon } from 'lucide-react'
import * as React from 'react'

import { ArchitectureChoice } from '@/code-maps/code-suggestions'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { useArchitectures } from '@/lib/architectures'
import { useCreateConversation } from '@/lib/assistant'
import { getErrorMessage } from '@/lib/client'
import type { CodeMapDetail } from '@/lib/code-maps'
import { useFeature } from '@/lib/feature-flags'
import { useStoredProvider } from '@/lib/llm-provider'
import { useT } from '@/lib/locale'

/** Shown for a ready map, with the assistant on and a provider set. */
export function OpenAssistantButton({
  map,
}: {
  map: Pick<CodeMapDetail, 'id' | 'projectId' | 'status'>
}) {
  const t = useT()
  const assistant = useFeature('diagram-assistant')
  const provider = useStoredProvider()
  const [open, setOpen] = React.useState(false)
  if (!assistant || provider === null || map.status !== 'ready') return null
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setOpen(true)
        }}
      >
        <SparklesIcon /> {t.code.assistantOpen}
      </Button>
      <OpenAssistantDialog open={open} onOpenChange={setOpen} map={map} />
    </>
  )
}

function OpenAssistantDialog({
  open,
  onOpenChange,
  map,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  map: Pick<CodeMapDetail, 'id' | 'projectId'>
}) {
  const t = useT()
  const navigate = useNavigate()
  const architectures = useArchitectures(map.projectId, '')
  const start = useCreateConversation()
  const list = architectures.data?.data ?? []
  const [chosen, setChosen] = React.useState<number | null>(null)
  const architectureId = chosen ?? list.at(0)?.id ?? null

  const submit = () => {
    if (architectureId === null) return
    start.mutate(undefined, {
      onSuccess: ({ conversation }) => {
        onOpenChange(false)
        void navigate({
          to: '/architectures/$id',
          params: { id: architectureId },
          search: { assistant: conversation.id, code: map.id },
        })
      },
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!start.isPending) onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t.code.assistantTitle}</DialogTitle>
          <DialogDescription>{t.code.assistantText}</DialogDescription>
        </DialogHeader>
        <ArchitectureChoice
          architectures={architectures.isPending ? null : list}
          architectureId={architectureId}
          onChange={setChosen}
          disabled={start.isPending}
        />
        {start.isError && (
          <Alert variant="destructive">
            <AlertTitle>{t.code.assistantFailed}</AlertTitle>
            <AlertDescription>{getErrorMessage(start.error, '')}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={start.isPending}
            onClick={() => {
              onOpenChange(false)
            }}
          >
            {t.code.cancel}
          </Button>
          <Button disabled={architectureId === null || start.isPending} onClick={submit}>
            {start.isPending ? <Spinner /> : <SparklesIcon />}
            {t.code.assistantOpen}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
