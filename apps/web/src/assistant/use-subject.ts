// What an assistant message is about, read from the context the owner made (`useAssistant`): one
// architecture alone (its views go with the message, or a diagram is drawn from its project's
// code map), or "Auto": the assistant reads the context's items and decides by itself what the
// message needs. Without "Auto" and without an architecture, a plain message.
import { useCodeMode } from '@/assistant/use-code-mode'
import { useArchitectures } from '@/lib/architectures'
import { type ContextItem, pageOf, sentContext, subjectOf } from '@/lib/assistant-subject'
import { useFeature } from '@/lib/feature-flags'
import type { StoredProvider } from '@/lib/llm-provider'

interface PageArchitecture {
  id: number
  title: string
  projectId: number | null
}

export type Subject = ReturnType<typeof useSubject>

/** The API runs no tool with the ChatGPT subscription: it is not known to drive them. */
function drivesTools(provider: StoredProvider | null) {
  return provider !== null && provider.kind !== 'openai-codex'
}

/** Whether a message can be left to "Auto": behind its flag, but for the ChatGPT subscription. */
export function useAutoOffered(provider: StoredProvider | null) {
  return useFeature('assistant-actions') && drivesTools(provider)
}

// ponytail: the first 100 architectures, as their own page lists them; the project of one further
// down is not known here, so "Draw from the code" is not offered for it.
function useArchitectureOptions(page: PageArchitecture | undefined): PageArchitecture[] {
  const listed = useArchitectures(undefined, '').data?.data ?? []
  return page && !listed.some((a) => a.id === page.id) ? [page, ...listed] : listed
}

export function useSubject({
  architecture,
  provider,
  codeMapId,
  pageConfigId,
  pageProjectId,
  items,
}: {
  /** The architecture whose page the owner is on: what a message is about with no context. */
  architecture?: PageArchitecture
  provider: StoredProvider | null
  codeMapId?: number
  pageConfigId?: number | null
  pageProjectId?: number | null
  /** The context the owner made. */
  items: readonly ContextItem[]
}) {
  const autoOffered = useAutoOffered(provider)
  const architectures = useArchitectureOptions(architecture)
  const route = subjectOf({ items, pageArchitectureId: architecture?.id ?? null, autoOffered })
  const architectureId = route.mode === 'architecture' ? route.architectureId : null
  const projectId = architectures.find((a) => a.id === architectureId)?.projectId ?? null
  const code = useCodeMode(projectId, codeMapId)

  return {
    mode: route.mode,
    /** The architecture a message is about while `mode` is `architecture`. */
    architectureId,
    /** The views the context names, sent whatever the owner picked; absent for all of them. */
    diagramIds: route.mode === 'architecture' ? route.diagramIds : undefined,
    code,
    /** Where the owner is, sent with a message in "Auto". */
    page: pageOf({
      architectureId: architecture?.id,
      configId: pageConfigId,
      projectId: pageProjectId,
    }),
    /** What "Auto" reads and the parts pointed at: the context, as the API takes it. */
    ...sentContext(items),
    architectures,
  }
}
