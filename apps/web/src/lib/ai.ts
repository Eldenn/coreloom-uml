export type AiChatStatus = 'submitted' | 'streaming' | 'ready' | 'error'

export interface AiTextPart {
  type: 'text'
  text: string
  state?: 'streaming' | 'done'
}
export interface AiReasoningPart {
  type: 'reasoning'
  text: string
  state?: 'streaming' | 'done'
}
export interface AiFilePart {
  type: 'file'
  mediaType: string
  url: string
  filename?: string
}
export interface AiSourceUrlPart {
  type: 'source-url'
  sourceId: string
  url: string
  title?: string
}
export interface AiSourceDocumentPart {
  type: 'source-document'
  sourceId: string
  title: string
  filename?: string
  mediaType?: string
}

export type AiToolState =
  | 'input-streaming'
  | 'input-available'
  | 'approval-requested'
  | 'approval-responded'
  | 'output-available'
  | 'output-error'
  | 'output-denied'

/** A tool call: `tool-<name>` parts and `dynamic-tool` parts (with `toolName`). */
export interface AiToolPart {
  type: `tool-${string}` | 'dynamic-tool'
  toolName?: string
  toolCallId: string
  title?: string
  state: AiToolState
  input?: unknown
  output?: unknown
  errorText?: string
  approval?: { id: string; approved?: boolean; reason?: string; requestReason?: string }
}

/**
 * A data part the app streams itself (`writer.write({ type: 'data-plan', id, data })`). Writing
 * again with the same `id` replaces the part, so one part can follow a task as it moves.
 */
export interface AiDataPart<Data = unknown> {
  type: `data-${string}`
  id?: string
  data: Data
}

/** Where a step of an agent's plan stands. */
export type AiPlanStepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped'

/** One step of an agent's plan: what it does and where it stands. */
export interface AiPlanStep {
  id: string
  title: string
  status: AiPlanStepStatus
  /** A line under the title: what the step found, why it failed. */
  detail?: string
}

/** The plan an agent works through, streamed as a `data-plan` part and updated as it goes. */
export interface AiPlan {
  title?: string
  steps: readonly AiPlanStep[]
}

/** Any part: the known ones above, or another kind (data-*, step-start…) the blocks skip. */
export type AiMessagePart =
  | AiTextPart
  | AiReasoningPart
  | AiFilePart
  | AiSourceUrlPart
  | AiSourceDocumentPart
  | AiToolPart
  | AiDataPart
  | { type: string; [key: string]: unknown }

/** Any message with an id, a role and parts — `UIMessage` from the AI SDK fits. */
export interface AiMessage {
  id: string
  role: 'system' | 'user' | 'assistant'
  parts: readonly AiMessagePart[]
}

export const isTextPart = (p: AiMessagePart): p is AiTextPart => p.type === 'text'
export const isReasoningPart = (p: AiMessagePart): p is AiReasoningPart => p.type === 'reasoning'
export const isFilePart = (p: AiMessagePart): p is AiFilePart => p.type === 'file'
export const isSourcePart = (p: AiMessagePart): p is AiSourceUrlPart | AiSourceDocumentPart =>
  p.type === 'source-url' || p.type === 'source-document'
export const isToolPart = (p: AiMessagePart): p is AiToolPart =>
  p.type === 'dynamic-tool' || p.type.startsWith('tool-')

export const isDataPart = (p: AiMessagePart): p is AiDataPart =>
  p.type.startsWith('data-') && 'data' in p

// Other agents' names for the same statuses (the todo lists of coding agents use `in_progress` and
// `completed`), so their plans can be passed as they are.
const PLAN_STATUS: Record<string, AiPlanStepStatus | undefined> = {
  pending: 'pending',
  todo: 'pending',
  running: 'running',
  in_progress: 'running',
  'in-progress': 'running',
  active: 'running',
  done: 'done',
  completed: 'done',
  complete: 'done',
  failed: 'failed',
  error: 'failed',
  skipped: 'skipped',
  cancelled: 'skipped',
  canceled: 'skipped',
}

/**
 * Reads a plan from untrusted data (a `data-plan` part, a tool's output): steps need a title;
 * unknown statuses count as pending, missing ids fall back to the position. Undefined if it isn't a plan.
 */
export function readPlan(value: unknown): AiPlan | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { title, steps } = value as { title?: unknown; steps?: unknown }
  if (!Array.isArray(steps)) return undefined
  const read: AiPlanStep[] = []
  steps.forEach((raw: unknown, i) => {
    if (typeof raw !== 'object' || raw === null) return
    const step = raw as Record<string, unknown>
    const text = step.title ?? step.content ?? step.text
    if (typeof text !== 'string' || !text.trim()) return
    const status =
      typeof step.status === 'string' ? PLAN_STATUS[step.status.toLowerCase()] : undefined
    read.push({
      id: typeof step.id === 'string' || typeof step.id === 'number' ? String(step.id) : String(i),
      title: text,
      status: status ?? 'pending',
      ...(typeof step.detail === 'string' && step.detail ? { detail: step.detail } : {}),
    })
  })
  return { ...(typeof title === 'string' && title ? { title } : {}), steps: read }
}

/** How far a plan is: steps finished (done or skipped), the total, the step running, any failure. */
export function planProgress(plan: AiPlan) {
  const finished = plan.steps.filter((s) => s.status === 'done' || s.status === 'skipped').length
  return {
    finished,
    total: plan.steps.length,
    current: plan.steps.find((s) => s.status === 'running'),
    failed: plan.steps.find((s) => s.status === 'failed'),
    complete: plan.steps.length > 0 && finished === plan.steps.length,
  }
}

/** The tool's name: `tool-searchDocs` → "searchDocs", or `toolName` on dynamic tools. */
export function toolName(part: AiToolPart) {
  return part.type === 'dynamic-tool' ? (part.toolName ?? 'tool') : part.type.slice('tool-'.length)
}

/** The message's text, joined: what "Copy" copies. */
export function messageText(message: AiMessage) {
  return message.parts
    .filter(isTextPart)
    .map((p) => p.text)
    .join('\n\n')
}

/** What a model can do, shown as badges in the model picker. Other strings show as they are. */
export type AiModelCapability =
  'vision' | 'tools' | 'reasoning' | 'fast' | 'files' | 'audio' | 'web'

/** A model a block can offer (agents, playground, prompt toolbar). */
export interface AiModel {
  id: string
  name: string
  /** "Anthropic", "OpenAI", "Mistral"… */
  provider?: string
  /** Short note shown under the name: "Fast, cheap", "Best reasoning". */
  description?: string
  /** How many tokens the context window holds (200_000). */
  contextWindow?: number
  /** Price per million tokens, in USD (or `pricing.currency`). */
  pricing?: { input: number; output: number; currency?: string }
  capabilities?: readonly (AiModelCapability | (string & {}))[]
  /** Shown but not choosable (not in the plan, unavailable). */
  disabled?: boolean
}

/** Token counts for a conversation or a turn — the AI SDK's `LanguageModelUsage` fits (v5's flat fields and
 *  v6+'s `…TokenDetails`). Reasoning tokens are part of the output, cached tokens part of the input. */
export interface AiUsage {
  inputTokens?: number | undefined
  outputTokens?: number | undefined
  totalTokens?: number | undefined
  reasoningTokens?: number | undefined
  cachedInputTokens?: number | undefined
  inputTokenDetails?: { cacheReadTokens?: number | undefined }
  outputTokenDetails?: { reasoningTokens?: number | undefined }
}

/** Reasoning and cached-input tokens, wherever the SDK version puts them. */
export function usageDetails(usage: AiUsage) {
  return {
    reasoning: usage.outputTokenDetails?.reasoningTokens ?? usage.reasoningTokens,
    cached: usage.inputTokenDetails?.cacheReadTokens ?? usage.cachedInputTokens,
  }
}

/** 950 → "950", 1_500 → "1.5K", 200_000 → "200K", 1_000_000 → "1M" — in the locale's compact notation. */
export function formatTokens(n: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: n >= 1000 && n < 10_000 ? 1 : n < 1_000_000 ? 0 : 1,
  }).format(n)
}

/** A price per million tokens: whole amounts without decimals ("$3"), others with two or three ("$0.25", "$0.075"). */
export function formatTokenPrice(value: number, locale: string, currency = 'USD') {
  const whole = Number.isInteger(value)
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 3,
  }).format(value)
}

/** The tokens used: `totalTokens`, or input + output. */
export function usageTotal(usage: AiUsage | number) {
  if (typeof usage === 'number') return usage
  return usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0)
}

/** What the tokens cost at a model's list price (cache discounts left out, so it's an upper estimate). */
export function estimateCost(usage: AiUsage, pricing: { input: number; output: number }) {
  return (
    ((usage.inputTokens ?? 0) * pricing.input + (usage.outputTokens ?? 0) * pricing.output) /
    1_000_000
  )
}

/** How full a context window is: "ok", then "warning" from 80 %, "critical" from 95 %. */
export function contextLevel(used: number, max: number): 'ok' | 'warning' | 'critical' {
  const ratio = max > 0 ? used / max : 0
  return ratio >= 0.95 ? 'critical' : ratio >= 0.8 ? 'warning' : 'ok'
}

/** Formats a cost in a currency (default USD) with enough decimals for fractions of a cent. */
export function formatCost(value: number, locale: string, currency = 'USD') {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
    maximumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
  }).format(value)
}

/** 950 → "950 ms", 12_400 → "12.4 s", 125_000 → "2 min 5 s". */
export function formatDuration(ms: number, locale: string) {
  const n = (v: number, unit: 'millisecond' | 'second' | 'minute', digits = 0) =>
    new Intl.NumberFormat(locale, {
      style: 'unit',
      unit,
      unitDisplay: 'narrow',
      maximumFractionDigits: digits,
    }).format(v)
  if (ms < 1000) return n(Math.round(ms), 'millisecond')
  if (ms < 60_000) return n(ms / 1000, 'second', ms < 10_000 ? 1 : 0)
  const min = Math.floor(ms / 60_000)
  const s = Math.round((ms % 60_000) / 1000)
  return s ? `${n(min, 'minute')} ${n(s, 'second')}` : n(min, 'minute')
}
