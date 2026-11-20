// One conversation of the assistant: what is sent with a message about the page's architecture
// (the views, their cost), the messages, and the prompt with what the message is about. A message
// about an architecture goes with its views, one "From the web" runs a research and stores the
// rules proposed, any other is a plain message. The server may hand a plain message over (to an
// architecture's diagrams, to a web research): it is then sent again that way, with no new input,
// which "Auto" relies on.
import { Link } from '@tanstack/react-router'
import * as React from 'react'

import { ProposalsFailed } from '@/agent-configs/agent-config-proposals'
import { ResearchSteps } from '@/agent-configs/import-review'
import { CodeSwitch } from '@/assistant/assistant-code'
import { MessageList } from '@/assistant/assistant-messages'
import { SubjectPicker } from '@/assistant/assistant-subject'
import { useChangeActions } from '@/assistant/use-change-actions'
import type { Subject } from '@/assistant/use-subject'
import { useWebRequest } from '@/assistant/use-web-request'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ContextMeter } from '@/components/ui/context-meter'
import { MultiSelect } from '@/components/ui/multi-select'
import { PromptInput } from '@/components/ui/prompt-input'
import { toast } from '@/components/ui/sonner'
import { Spinner } from '@/components/ui/spinner'
import type { ArchitectureDetail } from '@/lib/architectures'
import {
  type AssistantHandoff,
  type AutosaveControl,
  budgetLevel,
  type FileProblem,
  readAttachment,
  useAskAssistant,
  useContextBudget,
  useContinueConversation,
  useConversation,
  useDeleteSummary,
  type ViewSelection,
  viewTooLarge,
} from '@/lib/assistant'
import type { ContextBudget } from '@/lib/assistant-changes'
import { containsWebAddress } from '@/lib/assistant-subject'
import { getErrorMessage, TuyauError } from '@/lib/client'
import { providerCallFailure, type StoredProvider } from '@/lib/llm-provider'
import { useT } from '@/lib/locale'
import { useProviderFailureText } from '@/llm/provider-failure'

/** The architecture whose page the panel is on: the open view and the editor's autosave. */
export interface Workspace {
  architecture: ArchitectureDetail
  currentDiagramId: number | null
  autosave: AutosaveControl
}

/** The architecture a message is about, if any. */
function architectureOf(subject: Subject): number | null {
  return subject.mode === 'architecture' ? subject.architectureId : null
}

/**
 * The views a message reads. About the architecture whose page this is: the open view first, then
 * the ones the owner picked. About another one: all of its views, none of them first.
 */
function useViews(workspace: Workspace | null, subject: Subject) {
  /** The views the owner picked; `null` until one is unchecked, meaning all of them. */
  const [picked, setPicked] = React.useState<number[] | null>(null)
  const here =
    workspace !== null && architectureOf(subject) === workspace.architecture.id ? workspace : null
  const onPage = (page: Workspace): ViewSelection => ({
    currentDiagramId: page.currentDiagramId,
    ...(picked ? { diagramIds: picked } : {}),
  })
  return {
    selection: here ? onPage(here) : { currentDiagramId: null },
    /** The views of a message the assistant sends to an architecture by itself. */
    selectionOf: (architectureId: number): ViewSelection =>
      workspace?.architecture.id === architectureId
        ? onPage(workspace)
        : { currentDiagramId: null },
    versions: here ? here.architecture.diagrams.map((d) => d.version) : [],
    /** What the picker above the messages shows; `null` away from the architecture's page. */
    picker: here && {
      diagrams: here.architecture.diagrams,
      currentDiagramId: here.currentDiagramId,
      picked,
      onPickedChange: setPicked,
    },
  }
}

export function Conversation({
  workspace,
  conversationId,
  provider,
  onContinued,
  subject,
}: {
  workspace: Workspace | null
  conversationId: number
  provider: StoredProvider | null
  onContinued: (conversationId: number) => void
  subject: Subject
}) {
  const t = useT().assistant
  const detail = useConversation(conversationId)
  const views = useViews(workspace, subject)
  const fromCode = subject.code.sent !== undefined
  const context = useContextBudget(
    fromCode ? null : architectureOf(subject),
    conversationId,
    views.selection,
    views.versions,
  )
  const ask = useAskAssistant(conversationId)
  const web = useWebRequest(conversationId, subject.configId)
  const proceed = useContinueConversation()
  const deleteSummary = useDeleteSummary(conversationId)
  const changes = useChangeActions(
    conversationId,
    workspace && { architectureId: workspace.architecture.id, autosave: workspace.autosave },
  )
  const [draft, setDraft] = React.useState('')
  /** Why the file attached to the last message could not be sent. */
  const [fileProblem, setFileProblem] = React.useState<FileProblem | null>(null)
  /** A message the server handed over, from its answer until it was sent again that way. */
  const [handed, setHanded] = React.useState<Handed | null>(null)
  /** A long file is being read into notes, before the message itself is sent. */
  const [reading, setReading] = React.useState(false)

  const messages = detail.data?.messages ?? []
  const { budget, askError } = watched(fromCode, context.data, ask.error)

  const send = async (typed: string, files: File[]) => {
    if (!provider) return
    const attachment = await readAttachment(files)
    setFileProblem('problem' in attachment ? attachment.problem : null)
    if ('problem' in attachment) {
      // The field cleared itself on submit: the text comes back, the file is picked again.
      setDraft((now) => (now === '' ? typed : now))
      return
    }
    const { file } = attachment
    // A file alone is a request too.
    const text = typed === '' ? t.fileOnlyMessage : typed
    // The field cleared itself on submit: the text comes back so nothing is lost.
    const restore = () => {
      setDraft((now) => (now === '' ? text : now))
    }
    const research = (configId?: number) =>
      web.send(provider, text, configId).then((stored) => {
        if (!stored) restore()
      })
    if (subject.mode === 'web') {
      void research()
      return
    }
    // A promise, not callbacks: a handed-over message is sent again even once the panel closed,
    // since the server stored nothing of it. Sent once: a failure waits for the owner.
    void ask
      .mutateAsync({
        provider,
        message: text,
        file,
        onReading: setReading,
        architectureId: architectureOf(subject),
        ...views.selection,
        ...subject.code.sent,
        ...(subject.mode === 'auto' ? { auto: true, page: subject.page } : {}),
        onHandoff: (handoff) => {
          setHanded({ handoff, message: text })
        },
        viewsOf: views.selectionOf,
      })
      .then(({ handoff }) =>
        handoff?.kind === 'web' ? research(handoff.agentConfigId) : undefined,
      )
      // Told by `ask.error`.
      .catch(restore)
      .finally(() => {
        setHanded(null)
      })
  }
  const pending = pendingOf(subject, ask, web, { handed, reading })

  return (
    <>
      <WhatIsSent code={subject.code} views={views.picker} budget={budget} />
      <MessageList
        conversationId={conversationId}
        messages={messages}
        loaded={detail.isSuccess}
        asking={pending.text}
        askingFile={ask.isPending ? ask.variables.file?.name : null}
        waiting={pending.typing || proceed.isPending}
        progress={
          <>
            {pending.stage !== null && (
              <Stage
                stage={pending.stage}
                title={
                  subject.architectures.find((a) => a.id === stageTarget(pending.stage))?.title
                }
              />
            )}
            <WebProgress
              step={pending.webStep}
              model={provider?.model}
              configId={pending.configId}
            />
          </>
        }
        pageArchitectureId={workspace ? workspace.architecture.id : null}
        changes={changes}
        onDeleteSummary={(messageId) => {
          deleteSummary.mutate(messageId, {
            onError: (error) => toast.error(getErrorMessage(error, t.actionFailed)),
          })
        }}
      />
      <Composer
        provider={provider}
        subject={subject}
        draft={draft}
        onDraftChange={setDraft}
        budget={budget}
        fullness={fullness(budget, messages.length, askError)}
        ask={ask}
        web={web}
        handing={handed !== null}
        proceed={proceed}
        onContinue={() => {
          if (!provider) return
          proceed.mutate(
            { conversationId, provider },
            {
              onSuccess: ({ conversation }) => {
                onContinued(conversation.id)
              },
            },
          )
        }}
        fileProblem={fileProblem}
        onSend={(text, files) => void send(text, files)}
      />
    </>
  )
}

/** The text files the picker offers; anything else that reads as text is taken too. */
const ATTACHMENT_TYPES =
  'text/*,application/pdf,.pdf,.md,.markdown,.txt,.json,.yaml,.yml,.toml,.xml,.csv,.puml,.mmd'

/** Under the messages: what went wrong, what the message is about, and the prompt. */
function Composer({
  provider,
  subject,
  draft,
  onDraftChange,
  budget,
  fullness: { full, tooLarge },
  ask,
  web,
  handing,
  proceed,
  onContinue,
  fileProblem,
  onSend,
}: {
  provider: StoredProvider | null
  subject: Subject
  draft: string
  onDraftChange: (draft: string) => void
  budget: ContextBudget | undefined
  fullness: ReturnType<typeof fullness>
  ask: ReturnType<typeof useAskAssistant>
  web: ReturnType<typeof useWebRequest>
  /** A handed-over message is on its way to being sent again. */
  handing: boolean
  proceed: ReturnType<typeof useContinueConversation>
  onContinue: () => void
  /** Why the file of the last message could not be sent; told until the next one. */
  fileProblem: FileProblem | null
  onSend: (text: string, files: File[]) => void
}) {
  const t = useT().assistant
  const sending = ask.isPending || web.step !== null || handing
  /** "From the web" with no agent conventions to add the rules to. */
  const noTarget = subject.mode === 'web' && subject.configId === null
  return (
    <div className="flex flex-col gap-2 border-t border-border p-3">
      <Notices
        provider={provider}
        budget={budget}
        full={full}
        tooLarge={tooLarge}
        askError={ask.isError && !isContextFull(ask.error) ? ask.error : null}
        continueError={proceed.error}
        continuing={proceed.isPending}
        onContinue={onContinue}
      />
      {web.error !== null && <ProposalsFailed error={web.error} />}
      <FileProblemNotice problem={fileProblem} />
      {subject.webOffered && manual(subject) && containsWebAddress(draft) && (
        <p className="m-0 flex flex-wrap items-center gap-x-2 text-[12px] text-muted-foreground">
          {t.addressFound}
          <Button
            size="sm"
            variant="link"
            className="h-auto p-0"
            onClick={() => {
              subject.choose('web')
            }}
          >
            {t.useWeb}
          </Button>
        </p>
      )}
      <SubjectPicker subject={subject} disabled={sending} />
      <PromptInput
        value={draft}
        onValueChange={(value) => {
          onDraftChange(value)
          // A refused message is forgotten once edited, so the shortened one can be sent.
          if (ask.isError) ask.reset()
          web.forget()
        }}
        placeholder={placeholder(t, subject)}
        status={sending ? 'submitted' : 'ready'}
        disabled={!provider || full || proceed.isPending || noTarget}
        allowAttachments={takesFile(subject)}
        accept={ATTACHMENT_TYPES}
        onSubmit={({ text, files }) => {
          onSend(text, files)
        }}
      />
    </div>
  )
}

/** A web research reads pages and a code request reads a map: neither takes a file. */
function takesFile(subject: Subject) {
  return subject.mode !== 'web' && subject.code.sent === undefined
}

function FileProblemNotice({ problem }: { problem: FileProblem | null }) {
  const t = useT().assistant
  if (problem === null) return null
  return (
    <p role="alert" className="m-0 text-[12px] text-destructive">
      {t.fileProblems[problem]}
    </p>
  )
}

/** Neither "From the web" nor "Auto", which reads a web page by itself when one is named. */
function manual(subject: Subject) {
  return subject.mode !== 'web' && subject.mode !== 'auto'
}

function placeholder(t: ReturnType<typeof useT>['assistant'], subject: Subject) {
  if (subject.mode === 'web') return t.webPlaceholder
  if (subject.mode === 'auto') return t.autoPlaceholder
  if (subject.mode === 'none') return t.plainPlaceholder
  return subject.code.sent === undefined ? t.placeholder : t.codePlaceholder
}

interface Handed {
  handoff: AssistantHandoff
  message: string
}

/**
 * What "Auto" is doing with the message being sent: deciding what it needs (`architectureId`
 * undefined), then working on the diagrams of the architecture it chose. `null` when the typing
 * indicator or the research's own steps say it.
 */
function stageOf(auto: boolean, asking: boolean, handed: Handed | null, reading: boolean) {
  if (!asking) return null
  if (reading) return { reading: true as const }
  if (handed?.handoff.kind === 'diagrams') return { architectureId: handed.handoff.architectureId }
  return auto && handed === null ? { architectureId: undefined } : null
}

/**
 * What shows while a message is on its way: its text, then the typing indicator, or what "Auto" is
 * doing, or the steps of a research. One of the three at a time, with no gap between the server's
 * handoff and the call that follows it.
 */
function pendingOf(
  subject: Subject,
  ask: ReturnType<typeof useAskAssistant>,
  web: ReturnType<typeof useWebRequest>,
  { handed, reading }: { handed: Handed | null; reading: boolean },
) {
  const toWeb = handed?.handoff.kind === 'web' ? handed.handoff.agentConfigId : null
  // The research's first step shows from the handoff on, before its own call starts.
  const webStep = web.step ?? (toWeb === null ? null : 'researching')
  const stage = stageOf(subject.mode === 'auto', ask.isPending, handed, reading)
  return {
    text: ask.isPending ? ask.variables.message : (web.request ?? handed?.message ?? null),
    typing: ask.isPending && stage === null && webStep === null,
    stage,
    webStep,
    configId: toWeb ?? subject.configId,
  }
}

type StageNow = NonNullable<ReturnType<typeof stageOf>>

/** The architecture a stage works on, when it has one. */
function stageTarget(stage: StageNow | null) {
  return stage !== null && 'architectureId' in stage ? stage.architectureId : undefined
}

function stageText(t: ReturnType<typeof useT>['assistant'], stage: StageNow, title: string | null) {
  if ('reading' in stage) return t.readingFile
  return stage.architectureId === undefined ? t.deciding : t.workingOnDiagrams(title)
}

function Stage({
  stage,
  title,
}: {
  stage: NonNullable<ReturnType<typeof stageOf>>
  title: string | undefined
}) {
  const t = useT().assistant
  return (
    <p role="status" className="m-0 mr-6 flex items-center gap-2 text-[13px] text-muted-foreground">
      <Spinner />
      {stageText(t, stage, title ?? null)}
    </p>
  )
}

/** Under the message being sent: which of the two steps runs, and what the research has read. */
function WebProgress({
  step,
  model,
  configId,
}: {
  step: ReturnType<typeof useWebRequest>['step']
  model: string | undefined
  configId: number | null
}) {
  const t = useT().llm
  if (step === null || model === undefined || configId === null) return null
  return (
    <div className="mr-6 flex flex-col gap-2">
      <p role="status" className="m-0 flex items-center gap-2 text-[13px] text-muted-foreground">
        <Spinner /> {step === 'researching' ? t.researchReading(model) : t.researchWriting(model)}
      </p>
      {step === 'researching' && <ResearchSteps configId={configId} />}
    </div>
  )
}

/** The `code` of an API refusal (`{ error: { code } }`) with this status. */
function refusalCode(error: unknown, status: number) {
  return error instanceof TuyauError && error.status === status
    ? (error.response as { error?: { code?: string } } | undefined)?.error?.code
    : undefined
}

/** A 422 `{ error: { code: 'context_full' } }`: the message would not fit the model's input. */
const isContextFull = (error: unknown) => refusalCode(error, 422) === 'context_full'
/** A 409 `{ error: { code: 'files_full' } }`: the conversation holds as many files as it can. */
const isFilesFull = (error: unknown) => refusalCode(error, 409) === 'files_full'

/** Whether the next message can't be sent, and whether continuing in a new conversation helps. */
function fullness(budget: ContextBudget | undefined, messageCount: number, askError: unknown) {
  return {
    full: (budget !== undefined && budgetLevel(budget) === 'full') || isContextFull(askError),
    tooLarge: budget !== undefined && viewTooLarge(budget, messageCount),
  }
}

export function NoProvider() {
  const t = useT().assistant
  return (
    <Alert>
      <AlertDescription className="flex flex-col items-start gap-2">
        {t.noProvider}
        <Button size="sm" variant="outline" asChild>
          <Link to="/settings">{t.openSettings}</Link>
        </Button>
      </AlertDescription>
    </Alert>
  )
}

/**
 * What the conversation watches before a message: nothing while it draws from the code, since
 * such a request sends an outline of the map, not the views.
 */
function watched(fromCode: boolean, budget: ContextBudget | undefined, askError: unknown) {
  return fromCode ? { budget: undefined, askError: null } : { budget, askError }
}

/** Above the messages: the switch to the code when it is offered, else the views and their cost. */
function WhatIsSent({
  code,
  views,
  budget,
}: {
  code: Subject['code']
  /** `null` away from the architecture's page: every view is read, there is nothing to pick. */
  views: Omit<React.ComponentProps<typeof ViewsAndBudget>, 'budget'> | null
  budget: ContextBudget | undefined
}) {
  const fromCode = code.sent !== undefined
  return (
    <>
      {code.offered && <CodeSwitch checked={fromCode} onCheckedChange={code.set} />}
      {views && !fromCode && <ViewsAndBudget {...views} budget={budget} />}
    </>
  )
}

/** The views a message reads (the open one always) and what the next message would cost. */
function ViewsAndBudget({
  diagrams,
  currentDiagramId,
  picked,
  onPickedChange,
  budget,
}: {
  diagrams: ArchitectureDetail['diagrams']
  currentDiagramId: number | null
  picked: number[] | null
  onPickedChange: (ids: number[]) => void
  budget: ContextBudget | undefined
}) {
  const t = useT().assistant
  const titleOf = (id: number) => diagrams.find((d) => d.id === id)?.title ?? String(id)
  const included = picked ?? diagrams.map((d) => d.id)
  const value = [
    ...new Set([...(currentDiagramId === null ? [] : [currentDiagramId]), ...included]),
  ]
  return (
    <div className="flex flex-col gap-2 border-b border-border p-3">
      <MultiSelect
        aria-label={t.views}
        placeholder={t.views}
        searchPlaceholder={t.viewsSearch}
        options={diagrams.map((d) => ({
          value: String(d.id),
          label: d.title,
          disabled: d.id === currentDiagramId,
        }))}
        value={value.map(String)}
        onValueChange={(values) => {
          onPickedChange(values.map(Number))
        }}
      />
      <p className="m-0 text-[12px] text-muted-foreground">{t.viewsHint}</p>
      {budget && (
        <div className="flex flex-wrap items-center gap-2">
          <ContextMeter used={budget.system + budget.diagrams + budget.history} max={budget.max} />
          {budget.skipped.length > 0 && (
            <span className="text-[12px] text-warning">
              {t.skipped(budget.skipped.map(titleOf).join(', '))}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/** Above the prompt: a missing provider, a failed call, a conversation getting too long. */
function Notices({
  provider,
  budget,
  full,
  tooLarge,
  askError,
  continueError,
  continuing,
  onContinue,
}: {
  provider: StoredProvider | null
  budget: ContextBudget | undefined
  full: boolean
  /** Full with nothing to summarize: continuing would not help. */
  tooLarge: boolean
  askError: unknown
  continueError: unknown
  continuing: boolean
  onContinue: () => void
}) {
  const t = useT().assistant
  const failureText = useProviderFailureText()
  const long = full || (budget !== undefined && budgetLevel(budget) === 'warn')
  return (
    <>
      {provider === null && <NoProvider />}
      {askError !== null && (
        <Alert variant="destructive">
          <AlertDescription>
            {isFilesFull(askError) ? t.filesFull : failureText(providerCallFailure(askError))}
          </AlertDescription>
        </Alert>
      )}
      {continueError !== null && (
        <Alert variant="destructive">
          <AlertDescription>{failureText(providerCallFailure(continueError))}</AlertDescription>
        </Alert>
      )}
      {tooLarge ? (
        <Alert variant="destructive">
          <AlertDescription>{t.viewTooLarge}</AlertDescription>
        </Alert>
      ) : (
        long && (
          <Alert variant={full ? 'destructive' : 'warning'}>
            <AlertDescription className="flex flex-col items-start gap-2">
              {full ? t.full : t.long}
              <Button
                size="sm"
                variant="outline"
                disabled={!provider || continuing}
                onClick={onContinue}
              >
                {t.continue}
              </Button>
            </AlertDescription>
          </Alert>
        )
      )}
    </>
  )
}
