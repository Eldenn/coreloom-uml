import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { AssistantToolKind } from '@coreloom-uml/llm'
import { z } from 'zod'
import type {
  ActionFailure,
  ActionImpact,
  AssistantTargetKind,
} from '#app/assistant/constants/assistant'
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
 * sharing screen. `afterCommit` is work that cannot be rolled back (files in Drive), run once the
 * transaction that stores the new status has committed.
 */
export type ActionApplied =
  | { kind: AssistantTargetKind; id: number }
  | { deleted: true; afterCommit?: () => Promise<void> }
  | { failure: typeof ActionFailure.NotFound }
  | { failure: typeof ActionFailure.Invalid | typeof ActionFailure.Conflict; message: string }

type ActionBase<S extends z.ZodType> = { name: string; description: string; input: S }

export type ReadActionDefinition<S extends z.ZodType> = ActionBase<S> & {
  kind: typeof AssistantToolKind.Read
  read(input: z.output<S>, user: User): Promise<unknown>
}

export type WriteActionDefinition<S extends z.ZodType> = ActionBase<S> & {
  kind: typeof AssistantToolKind.Write
  destructive?: true
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
  /** The state the action changes, as it is when proposed (shown before → after). */
  before?(input: z.output<S>, user: User): Promise<string | null>
  /** What a deletion takes with it, counted when proposed. */
  impact?(input: z.output<S>, user: User): Promise<Partial<Record<ActionImpact, number>>>
  /** Runs inside the transaction (`client`) that stores the action's new status. */
  apply(input: z.output<S>, user: User, client: TransactionClientContract): Promise<ActionApplied>
}

/** An action with its input type erased: every entry point parses the input with `input` first. */
export type AssistantAction =
  | (ActionBase<z.ZodType> & {
      kind: typeof AssistantToolKind.Read
      read(input: unknown, user: User): Promise<unknown>
    })
  | (ActionBase<z.ZodType> & {
      kind: typeof AssistantToolKind.Write
      destructive?: true
      problem?(input: unknown): string | null
      subject(input: unknown, user: User): Promise<string | null | typeof TARGET_NOT_FOUND>
      currentProblem(input: unknown, user: User): Promise<string | null>
      before(input: unknown, user: User): Promise<string | null>
      impact(input: unknown, user: User): Promise<Partial<Record<ActionImpact, number>>>
      apply(input: unknown, user: User, client: TransactionClientContract): Promise<ActionApplied>
    })

export function readAction<S extends z.ZodType>(
  definition: ReadActionDefinition<S>,
): AssistantAction {
  return {
    ...definition,
    read: (input, user) => definition.read(definition.input.parse(input), user),
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

/** A positive id, as the routes' `withoutDecimals().min(1)`. */
export const idInput = () => z.number().int().positive()

/** Most items a list action answers: the newest first. */
export const ASSISTANT_READ_LIST_MAX = 50

/** What the model is told of a target that is missing or not the caller's. */
export const NOT_FOUND_SENTENCE = 'Not found: no such item exists in this account.'
