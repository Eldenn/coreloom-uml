// What an assistant message is about: one of the account's architectures (its views go with the
// message, or a diagram is drawn from its project's code map), agent conventions made from web
// pages ("From the web"), nothing, or "Auto": the assistant then decides by itself what the
// message needs. Held by the panel, so it stays from one conversation to the next.
import * as React from 'react'

import { useCodeMode } from '@/assistant/use-code-mode'
import { useAgentConfigs } from '@/lib/agent-configs'
import { useArchitectures } from '@/lib/architectures'
import { defaultConventions, pageOf, type SubjectMode, subjectMode } from '@/lib/assistant-subject'
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
  const webOffered = useFeature('web-research') && drivesTools(provider)
  const architectures = useArchitectureOptions(architecture)
  // The server routes a message by itself behind this flag, but for the ChatGPT subscription.
  const autoOffered = useFeature('assistant-actions') && drivesTools(provider)
  /** `null` until the owner chooses: the flags are not read yet when the panel opens. */
  const [wanted, setWanted] = React.useState<SubjectMode | null>(null)
  const [architectureId, setArchitectureId] = React.useState(architecture?.id ?? null)
  const mode = subjectMode({
    wanted,
    autoOffered,
    webOffered,
    onArchitecture: architecture !== undefined,
  })
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
    autoOffered,
    /** Where the owner is, sent with a message in "Auto". */
    page: pageOf({
      architectureId: architecture?.id,
      configId: pageConfigId,
      projectId: pageProjectId,
    }),
    architectures,
    configs: conventions.configs,
    choose: (next: 'auto' | 'web' | 'none') => {
      setWanted(next)
    },
    chooseArchitecture: (id: number) => {
      setArchitectureId(id)
      setWanted('architecture')
    },
    chooseConventions: conventions.choose,
  }
}
