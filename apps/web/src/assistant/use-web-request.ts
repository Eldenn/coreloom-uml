import { type AssistantMessage, useShowExchange } from '@/lib/assistant'
import { type StoredProvider, useAgentResearch, useImportAgentFile } from '@/lib/llm-provider'

export type WebStep = 'researching' | 'writing' | null

function stepOf(researching: boolean, writing: boolean): WebStep {
  if (researching) return 'researching'
  return writing ? 'writing' : null
}

/**
 * A message sent "From the web": the research (the user's model reads the pages from a sandbox),
 * then the proposals, which the server stores in the conversation with the request. A request
 * whose pages were read and whose proposals failed keeps its findings: sent again, it does not pay
 * for the research twice. It goes on when the panel closes, since the exchange lands in the
 * conversation either way.
 */
export function useWebRequest(conversationId: number, configId: number | null) {
  const research = useAgentResearch(configId ?? 0)
  const read = useImportAgentFile(configId ?? 0)
  const show = useShowExchange(conversationId)
  const step = stepOf(research.isPending, read.isPending)
  return {
    step,
    /** The request on its way, shown as the owner's message until the server stored it. */
    request: step === null ? null : (research.variables?.request ?? null),
    error: research.error ?? read.error,
    /** A failure is forgotten once the message is edited; the findings stay for the same text. */
    forget: () => {
      if (research.isError) research.reset()
      if (read.isError) read.reset()
    },
    /** Resolves to whether the exchange was stored. */
    send: async (provider: StoredProvider, request: string): Promise<boolean> => {
      try {
        const found =
          research.data && research.variables.request === request
            ? research.data
            : await research.mutateAsync({ provider, request })
        const body: { messages?: AssistantMessage[] } = await read.mutateAsync({
          provider,
          content: found.findings,
          origin: 'research',
          conversation: { id: conversationId, request, sources: found.sources },
        })
        research.reset()
        await show(body.messages ?? [])
        return true
      } catch {
        // Told by `error`.
        return false
      }
    },
  }
}
