// What an assistant message is about: one of the account's architectures (its views go with the
// message, or a diagram is drawn from its project's code map), agent conventions made from web
// pages ("From the web"), or nothing. Held by the panel, so it stays from one conversation to the
// next.
import * as React from 'react'

import { useCodeMode } from '@/assistant/use-code-mode'
import { useAgentConfigs } from '@/lib/agent-configs'
import { useArchitectures } from '@/lib/architectures'
import { defaultConventions } from '@/lib/assistant-subject'
import { useFeature } from '@/lib/feature-flags'
import type { StoredProvider } from '@/lib/llm-provider'

type Mode = 'architecture' | 'web' | 'none'

interface PageArchitecture {
  id: number
  title: string
  projectId: number | null
}

export type Subject = ReturnType<typeof useSubject>

/** The API refuses the ChatGPT subscription: it is not known to drive the sandbox's tools. */
function canResearch(provider: StoredProvider | null) {
  return provider !== null && provider.kind !== 'openai-codex'
}

// ponytail: the first 100 architectures and conventions, as their own pages list them; a search in
// the picker if an account ever holds more.
function useArchitectureOptions(page: PageArchitecture | undefined): PageArchitecture[] {
  const listed = useArchitectures(undefined, '').data?.data ?? []
  return page && !listed.some((a) => a.id === page.id) ? [page, ...listed] : listed
}

/** The agent conventions "From the web" adds rules to: the owner's pick, else the default. */
function useConventions(pageConfigId: number | null, projectId: number | null) {
  const configs = useAgentConfigs({}).data?.data ?? []
  const [picked, setPicked] = React.useState<number | null>(null)
  return {
    configs,
    configId:
      configs.find((config) => config.id === picked)?.id ??
      defaultConventions({ pageConfigId, projectId, configs }),
    choose: setPicked,
  }
}

export function useSubject({
  architecture,
  provider,
  codeMapId,
  pageConfigId,
  pageProjectId,
}: {
  /** The architecture whose page the panel is on: what a message is about at first. */
  architecture?: PageArchitecture
  provider: StoredProvider | null
  codeMapId?: number
  /** On agent conventions' page: the ones "From the web" targets first. */
  pageConfigId?: number | null
  /** On a project's page: "From the web" targets its conventions first. */
  pageProjectId?: number | null
}) {
  const webOffered = useFeature('web-research') && canResearch(provider)
  const architectures = useArchitectureOptions(architecture)
  const [wanted, setWanted] = React.useState<Mode>(architecture ? 'architecture' : 'none')
  const [architectureId, setArchitectureId] = React.useState(architecture?.id ?? null)
  const mode: Mode = wanted === 'web' && !webOffered ? 'none' : wanted
  // Kept while the message is about something else: its project still names the conventions.
  const projectId = architectures.find((a) => a.id === architectureId)?.projectId ?? null
  const code = useCodeMode(mode === 'architecture' ? projectId : null, codeMapId)
  const conventions = useConventions(pageConfigId ?? null, pageProjectId ?? projectId)

  return {
    mode,
    /** The architecture a message is about while `mode` is `architecture`. */
    architectureId,
    /** `null` until the owner picks some, when neither the page nor a project names any. */
    configId: conventions.configId,
    code,
    webOffered,
    architectures,
    configs: conventions.configs,
    choose: (next: 'web' | 'none') => {
      setWanted(next)
    },
    chooseArchitecture: (id: number) => {
      setArchitectureId(id)
      setWanted('architecture')
    },
    chooseConventions: conventions.choose,
  }
}
