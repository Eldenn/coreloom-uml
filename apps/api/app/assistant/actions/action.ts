import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { AssistantToolKind } from '@coreloom-uml/llm'
import { z } from 'zod'
import type {
  ActionFailure,
  ActionImpact,
  AssistantTargetKind,
} from '#app/assistant/constants/assistant'
import type AssistantFile from '#app/assistant/models/assistant-file'
import type { RepositorySession } from '#app/assistant/services/repository-session'
import type User from '#app/users/models/user'

/*
 * What the assistant can do on the account's work, one file per domain. A `read` action runs
 * during the model's loop and answers bounded data of the caller's account only. A `write` action
 * never runs during the loop: it is stored as a proposal, and `apply` runs only when the owner
 * accepts it, through the same service as the matching HTTP route (same checks, same side
 * effects). Never declare an action on the account, its keys or tokens, the administration,
 * the flags or GitHub.
 */

/** The target a write action names is missing or not the caller's: nothing is proposed. */
export const TARGET_NOT_FOUND: unique symbol = Symbol('target not found')

/**
 * What an accepted action created or changed, that it deleted its target, or why it could not be
 * applied. Never a share link, a share token or an access code: the owner reads those on the
 * sharing screen. `afterCommit` is work that cannot be rolled back or must not see the rows before
 * they are committed (files in Drive, a queued job), run once the transaction that stores the new
 * status has committed.
 */
export type ActionApplied =
  | { kind: AssistantTargetKind; id: number; afterCommit?: () => Promise<void> }
  | { deleted: true; afterCommit?: () => Promise<void> }
  | { failure: typeof ActionFailure.NotFound }
  | { failure: typeof ActionFailure.Invalid | typeof ActionFailure.Conflict; message: string }

/**
 * Where a read runs: the conversation of the message, the reader of its files' texts (each read
 * from Drive once per message) and its repository sandbox.
 */
export type ActionContext = {
  conversationId: number
  read(file: AssistantFile): Promise<string>
  /** The conversation's repository sandbox, opened by the first repository tool called. */
  repository: RepositorySession
}

type ActionBase<S extends z.ZodType> = {
  name: string
  description: string
  input: S
  /**
   * Whether the user may use it now (a feature flag): when false it is not offered to the model,
   * and a stored proposal fails `not_found` when accepted.
   */
  available?(user: User): Promise<boolean>
}

/** What an action takes with it, counted now. */
export type ImpactCounts = Partial<Record<ActionImpact, number>>
/**
 * Cannot be undone; a function when it depends on the state the action changes (`before`) or on
 * what it takes with it (`impact`).
 */
type Destructive = true | ((before: string | null, impact: ImpactCounts) => boolean)

export type ReadActionDefinition<S extends z.ZodType> = ActionBase<S> & {
  kind: typeof AssistantToolKind.Read
  read(input: z.output<S>, user: User, context: ActionContext): Promise<unknown>
}

export type WriteActionDefinition<S extends z.ZodType> = ActionBase<S> & {
  kind: typeof AssistantToolKind.Write
  destructive?: Destructive
  /**
   * Why the input can never be applied, read from the input alone (no query): the model is told
   * and nothing is proposed, so the owner is not shown a card that can only fail.
   */
  problem?(input: z.output<S>): string | null
  /** The display name of the target now (null for a creation), or `TARGET_NOT_FOUND`. */
  subject(input: z.output<S>, user: User): Promise<string | null | typeof TARGET_NOT_FOUND>
  /**
   * Why the target, as it is now, cannot take the input (a no-op, a state it lacks): asked after
   * `subject` found it; the model is told and nothing is proposed.
   */
  currentProblem?(input: z.output<S>, user: User): Promise<string | null>
  /**
   * The state the action changes, as it is now: a visibility shown before → after, or a value
   * the card does not show as such (a revision, a fingerprint of a role) that only has to stay
   * the same until the owner accepts.
   */
  before?(input: z.output<S>, user: User): Promise<string | null>
  /** What the action takes with it (a deletion's content, a generation dropped), as it is now. */
  impact?(input: z.output<S>, user: User): Promise<ImpactCounts>
  /** Runs inside the transaction (`client`) that stores the action's new status. */
  apply(input: z.output<S>, user: User, client: TransactionClientContract): Promise<ActionApplied>
}

/** An action with its input type erased: every entry point parses the input with `input` first. */
export type AssistantAction =
  | (ActionBase<z.ZodType> & {
      kind: typeof AssistantToolKind.Read
      read(input: unknown, user: User, context: ActionContext): Promise<unknown>
    })
  | (ActionBase<z.ZodType> & {
      kind: typeof AssistantToolKind.Write
      destructive?: Destructive
      problem?(input: unknown): string | null
      subject(input: unknown, user: User): Promise<string | null | typeof TARGET_NOT_FOUND>
      currentProblem(input: unknown, user: User): Promise<string | null>
      before(input: unknown, user: User): Promise<string | null>
      impact(input: unknown, user: User): Promise<ImpactCounts>
      apply(input: unknown, user: User, client: TransactionClientContract): Promise<ActionApplied>
    })

export function readAction<S extends z.ZodType>(
  definition: ReadActionDefinition<S>,
): AssistantAction {
  return {
    ...definition,
    read: (input, user, context) => definition.read(definition.input.parse(input), user, context),
  }
}

export function writeAction<S extends z.ZodType>(
  definition: WriteActionDefinition<S>,
): AssistantAction {
  return {
    ...definition,
    problem: (input) => definition.problem?.(definition.input.parse(input)) ?? null,
    subject: (input, user) => definition.subject(definition.input.parse(input), user),
    currentProblem: async (input, user) =>
      (await definition.currentProblem?.(definition.input.parse(input), user)) ?? null,
    before: async (input, user) =>
      (await definition.before?.(definition.input.parse(input), user)) ?? null,
    impact: async (input, user) =>
      (await definition.impact?.(definition.input.parse(input), user)) ?? {},
    apply: (input, user, client) => definition.apply(definition.input.parse(input), user, client),
  }
}

/** How many rows a query finds. */
export async function countOf(query: {
  count(columns: string): Promise<{ $extras: Record<string, unknown> }[]>
}): Promise<number> {
  const [row] = await query.count('* as total')
  return Number(row?.$extras.total ?? 0)
}

/** A positive id, as the routes' `withoutDecimals().min(1)`. */
export const idInput = () => z.number().int().positive()

/** Most items a list action answers: the newest first. */
export const ASSISTANT_READ_LIST_MAX = 50

/** What the model is told of a target that is missing or not the caller's. */
export const NOT_FOUND_SENTENCE = 'Not found: no such item exists in this account.'
