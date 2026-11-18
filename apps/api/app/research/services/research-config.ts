import env from '#start/env'

/** How the SDK reaches E2B: the cloud with a key alone, a self-hosted install with its URLs. */
export type ResearchConfig = {
  e2bApiKey: string
  /** A self-hosted install's API and sandbox traffic addresses; E2B Cloud when absent. */
  e2bApiUrl?: string
  e2bSandboxUrl?: string
}

/** The sandbox settings, or null without `E2B_API_KEY`: every research route then answers 404. */
export function researchConfig(): ResearchConfig | null {
  const e2bApiKey = env.get('E2B_API_KEY')?.trim()
  if (!e2bApiKey) return null
  return {
    e2bApiKey,
    e2bApiUrl: env.get('E2B_API_URL')?.trim() || undefined,
    e2bSandboxUrl: env.get('E2B_SANDBOX_URL')?.trim() || undefined,
  }
}
