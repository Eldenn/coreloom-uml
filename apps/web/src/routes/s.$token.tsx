// A share link (RM-25 to RM-29): the architecture read-only, behind its access code when it's
// protected. No sign-in needed; the owner opening their own link gets "Open in the editor".
import { createFileRoute, Link } from '@tanstack/react-router'
import { PencilIcon } from 'lucide-react'
import * as React from 'react'

import { AccessCodeGate } from '@/components/access-code-gate'
import { Brand } from '@/components/brand'
import { DiagramViewer } from '@/components/diagram-viewer'
import { NotFoundPage, ServerErrorPage } from '@/components/error-page'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useT } from '@/lib/locale'
import {
  type SharedArchitecture,
  type UnlockRefusal,
  unlockRefusal,
  useSharedArchitecture,
  useUnlockShared,
} from '@/lib/shared'

/** Matches the API's access codes (`ACCESS_CODE_ALPHABET` / `ACCESS_CODE_LENGTH`). */
const ACCESS_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const ACCESS_CODE_LENGTH = 8

export const Route = createFileRoute('/s/$token')({
  head: () => ({ meta: [{ name: 'robots', content: 'noindex, nofollow' }] }),
  component: SharedPage,
})

function SharedPage() {
  const t = useT()
  const { token } = Route.useParams()
  const shared = useSharedArchitecture(token)

  if (shared.isPending)
    return (
      <SharedLayout>
        <Skeleton className="h-[480px] w-full" />
      </SharedLayout>
    )
  if (shared.isError)
    return <ServerErrorPage brand={<Brand />} onRetry={() => void shared.refetch()} />
  const result = shared.data
  if (result.status === 'unavailable')
    return (
      <NotFoundPage
        brand={<Brand />}
        title={t.shared.unavailableTitle}
        description={t.shared.unavailableText}
      />
    )
  if (result.status === 'locked')
    return (
      <SharedLayout>
        <CodeGate token={token} title={result.title} />
      </SharedLayout>
    )
  return (
    <SharedLayout>
      <SharedViewer architecture={result.architecture} architectureId={result.architectureId} />
    </SharedLayout>
  )
}

function SharedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header>
        <Brand />
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  )
}

function CodeGate({ token, title }: { token: string; title: string }) {
  const t = useT()
  const unlock = useUnlockShared(token)
  const [refusal, setRefusal] = React.useState<UnlockRefusal | null>(null)
  return (
    <div className="flex flex-1 items-center justify-center">
      <AccessCodeGate
        title={title}
        length={ACCESS_CODE_LENGTH}
        alphabet={ACCESS_CODE_ALPHABET}
        pending={unlock.isPending}
        error={refusal && !refusal.lockedUntil ? t.shared.wrongCode : undefined}
        attemptsLeft={refusal?.attemptsLeft}
        lockedUntil={refusal?.lockedUntil}
        onSubmit={async (code) => {
          try {
            await unlock.mutateAsync(code)
          } catch (error) {
            setRefusal(unlockRefusal(error))
            throw error
          }
        }}
      />
    </div>
  )
}

function SharedViewer({
  architecture,
  architectureId,
}: {
  architecture: SharedArchitecture
  architectureId: number | null
}) {
  const t = useT()
  // Views that were never drawn have nothing to show a visitor.
  const diagrams = architecture.diagrams.flatMap((d) =>
    d.content ? [{ id: String(d.id), title: d.title, diagram: d.content }] : [],
  )
  return (
    <DiagramViewer
      title={architecture.title}
      description={architecture.description ?? undefined}
      updatedAt={new Date(architecture.updatedAt)}
      diagrams={diagrams}
      fileName={architecture.title}
      banner={
        architectureId !== null ? (
          <Button asChild size="sm" variant="secondary">
            <Link to="/architectures/$id" params={{ id: architectureId }}>
              <PencilIcon />
              {t.shared.openInEditor}
            </Link>
          </Button>
        ) : undefined
      }
    />
  )
}
