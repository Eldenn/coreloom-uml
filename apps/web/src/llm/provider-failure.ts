import type { ProviderCallFailure } from '@/lib/llm-provider'
import { useT } from '@/lib/locale'

/** A failed call with the user's provider, as one sentence. */
export function useProviderFailureText() {
  const t = useT()
  return (failure: ProviderCallFailure) => {
    switch (failure.kind) {
      case 'provider':
        return t.llm.reasons[failure.reason]
      case 'rate-limited':
        return t.llm.rateLimited
      case 'refused':
        return failure.message ? `${t.llm.refused} ${failure.message}` : t.llm.refused
      default:
        return t.llm.failed
    }
  }
}
